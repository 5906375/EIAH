#!/usr/bin/env python3
"""BACKUP-A — dashboard local (STORAGE-02B.11-DEC-20261017-01).

Servidor HTTP somente em 127.0.0.1, biblioteca padrão apenas. Consultas (GET) são somente leitura e NUNCA chamam AWS.
Ações com efeito (POST): verificar sessão AWS, preparar plano (opcionalmente com HeadObject), executar upload de UM run
reutilizando `backup-a.sh upload --run RUN --full-verify`, conciliar (`backup-a.sh reconcile`). Nenhuma captura, limpeza,
restauração, descriptografia ou alteração de timers/IAM existe aqui.
Sem shell: todos os subprocessos usam listas de argumentos fixos; identificadores de run só são aceitos se existirem no inventário local.
"""
import os, sys, re, json, time, threading, subprocess, hashlib, secrets, hmac, shutil, socket, signal, math, getpass
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HOME = os.path.expanduser("~")
HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")
CONF_PATH = os.environ.get("BAD_CONF") or os.path.join(HOME, ".eiah-aws/automation/backup-a/backup-a.env")
SCRIPT = os.environ.get("BAD_BACKUP_A_SH") or os.path.join(HOME, ".eiah-aws/automation/backup-a/backup-a.sh")
STATE_DIR = os.environ.get("BAD_STATE_DIR") or os.path.join(HOME, ".eiah-aws/dashboard-state")
OPERATOR_PROFILE = os.environ.get("BAD_OPERATOR_PROFILE") or "<IAM_PROFILE_OPERATOR_LOGIN>"
RECOVERY_FILE = os.environ.get("BAD_RECOVERY_FILE") or os.path.join(HERE, "recovery-evidence.json")
REPO_OVERRIDE = os.environ.get("BAD_REPO")
TZ_BR = "America/Sao_Paulo"
SESSION_MAX_AGE_S = 15 * 60          # sessão AWS precisa ter sido verificada há menos disso para liberar o envio
PLAN_TTL_S = 30 * 60
REFRESH_TTL_S = 2.0
LOGIN_CMD = ("source ~/.eiah-aws/env.sh\n"
             "BROWSER=~/.eiah-aws/open-after-listener.sh eiah_aws login --profile <IAM_PROFILE_OPERATOR_LOGIN> --redirect-port 34977")
TIMERS = ("backup-a-capture-daily.timer", "backup-a-capture-weekly.timer")
SERVICES = ("backup-a-capture@daily.service", "backup-a-capture@weekly.service")
RUN_RE = re.compile(r"^BA-AUTO-(daily|weekly)-(\d{8}T\d{9}Z)-([0-9a-f]{6})$")
MAN_RE = re.compile(r"^BACKUP-A-(\d{8}T\d{6}Z)$")
KEY_RE = re.compile(r"^[A-Za-z0-9/_.\-]{1,400}$")
EXPECTED = {"daily": ["BA-01-git-core", "BA-02-worktrees-state", "BA-06-github-metadata"],
            "weekly": ["BA-01-git-core", "BA-02-worktrees-state", "BA-03-nongit-projects", "BA-04-home-evidence", "BA-05-historical-backups", "BA-06-github-metadata"]}
NA = None


# ------------------------------------------------------------------ utilidades
class Unavailable(Exception):
    pass


def run_cmd(args, timeout=20, env_extra=None):
    env = dict(os.environ)
    env.update(env_extra or {})
    try:
        p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, env=env, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        raise Unavailable("tempo esgotado: " + os.path.basename(args[0]))
    except OSError as e:
        raise Unavailable("%s: %s" % (os.path.basename(args[0]), e.strerror))
    return p.returncode, p.stdout.decode("utf-8", "replace"), p.stderr.decode("utf-8", "replace")


def read_text(path, limit=1 << 20):
    try:
        with open(path, "rb") as f:
            return f.read(limit).decode("utf-8", "replace")
    except OSError:
        return None


def tail_bytes(path, n=16384):
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - n))
            data = f.read(n).decode("utf-8", "replace")
            return ("[…início omitido…]\n" if size > n else "") + data
    except OSError:
        return None


def parse_env(path):
    cfg = {}
    txt = read_text(path)
    if txt is None:
        raise Unavailable("config ilegível: " + path)
    for line in txt.splitlines():
        m = re.match(r"^\s*(BA_[A-Z0-9_]+)=(.*)$", line)
        if not m:
            continue
        v = re.sub(r"\s+#.*$", "", m.group(2)).strip().strip('"').strip("'")
        cfg[m.group(1)] = v.replace("${HOME}", HOME).replace("$HOME", HOME)
    return cfg


# ------------------------------------------------------------------ tempo (conversão sempre por `date` + tzdata)
@lru_cache(maxsize=8192)
def fmt_epoch(epoch):
    try:
        _, b, _ = run_cmd(["date", "--date=@%d" % epoch, "+%Y-%m-%dT%H:%M:%S%:z"], 5, {"TZ": TZ_BR})
        _, u, _ = run_cmd(["date", "--date=@%d" % epoch, "+%Y-%m-%dT%H:%M:%SZ"], 5, {"TZ": "UTC"})
    except Unavailable:
        return None
    b, u = b.strip(), u.strip()
    return {"epoch": epoch, "brt": b, "utc": u} if b and u else None


@lru_cache(maxsize=8192)
def epoch_of(text):
    try:
        rc, out, _ = run_cmd(["date", "--date=" + text, "+%s"], 5)
    except Unavailable:
        return None
    out = out.strip()
    return int(out) if rc == 0 and out.isdigit() else None


def tinfo(text):
    """text: string original (systemd, ISO...). Retorna {original, epoch, brt, utc} ou None."""
    if not text or text in ("n/a", "(vazio)"):
        return None
    e = epoch_of(text)
    if e is None:
        return None
    f = fmt_epoch(e)
    if f is None:
        return None
    d = dict(f)
    d["original"] = text
    return d


def now_info():
    return fmt_epoch(int(time.time()))


def runid_time(run_id):
    m = re.search(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})", run_id)
    if not m:
        return None
    t = tinfo("%s-%s-%s %s:%s:%s UTC" % m.groups())
    if t:
        t["original"] = run_id
    return t


# ------------------------------------------------------------------ config e fontes
def conf():
    c = parse_env(CONF_PATH)
    c.setdefault("BA_HOME", os.path.join(HOME, ".eiah-aws/backup-a-auto"))
    for k, d in (("BA_QUEUE_MAX_MB", "1500"), ("BA_ARCHIVE_MAX_MB", "4000"), ("BA_MIN_FREE_MB", "3000"), ("BA_SPACE_PATH", "/mnt/c"),
                 ("BA_BUCKET", ""), ("BA_REGION", ""), ("BA_PREFIX", ""), ("BA_PROFILE_WRITER", "<IAM_ROLE_WRITER>"),
                 ("BA_PROFILE_RESTORE", "<IAM_ROLE_RESTORE>"), ("BA_ARN_WRITER", "assumed-role/<IAM_ROLE_WRITER_NAME>"),
                 ("BA_ARN_RESTORE", "assumed-role/<IAM_ROLE_RESTORE_NAME>")):
        c.setdefault(k, d)
    return c


def du_mb(path):
    total = 0
    try:
        for dp, dn, fn in os.walk(path):
            total += os.lstat(dp).st_blocks
            for f in fn:
                try:
                    total += os.lstat(os.path.join(dp, f)).st_blocks
                except OSError:
                    pass
    except OSError:
        return None
    return int(math.ceil(total * 512 / 1048576.0))


_du_cache = {}


def run_mb(path, state):
    if state == "UPLOADED_VERIFIED":
        try:
            key = (path, os.stat(os.path.join(path, "STATE")).st_mtime_ns)
        except OSError:
            key = None
        if key and key in _du_cache:
            return _du_cache[key]
        v = du_mb(path)
        if key and v is not None:
            _du_cache[key] = v
        return v
    return du_mb(path)


def tsv(path, limit=1 << 20):
    txt = read_text(path, limit)
    if txt is None:
        return None
    lines = [l for l in txt.splitlines() if l.strip()]
    if not lines:
        return []
    hdr = lines[0].split("\t")
    return [dict(zip(hdr, l.split("\t"))) for l in lines[1:]]


def sources(c):
    """Inventário local: {run_id: {dir, source, profile}}."""
    inv, info = {}, []
    q = os.path.join(c["BA_HOME"], "queue")
    n = 0
    err = None
    try:
        for name in sorted(os.listdir(q)):
            m = RUN_RE.match(name)
            d = os.path.join(q, name)
            if m and os.path.isdir(d) and not os.path.islink(d):
                inv[name] = {"dir": d, "source": "queue", "profile": m.group(1)}
                n += 1
    except OSError as e:
        err = "fila ilegível: %s" % e.strerror
    info.append({"name": "fila BACKUP-A (automação)", "path": q, "count": n, "error": err})
    g3 = c.get("BA_BASELINE_G3_RECEIPTS")
    n, err = 0, None
    if g3:
        man = os.path.dirname(os.path.dirname(g3))
        try:
            for name in sorted(os.listdir(man)):
                if MAN_RE.match(name) and os.path.isdir(os.path.join(man, name)) and os.path.isdir(os.path.join(man, name, "objects")):
                    inv[name] = {"dir": os.path.join(man, name), "source": "manual", "profile": "manual"}
                    n += 1
        except OSError as e:
            err = "pasta de capturas manuais ilegível: %s" % e.strerror
        info.append({"name": "capturas manuais (G3)", "path": man, "count": n, "error": err})
    return inv, info


def g5_rows(c):
    p = c.get("BA_BASELINE_G5_OBJECTS")
    return (tsv(p) or []) if p else []


def recovery_entries():
    txt = read_text(RECOVERY_FILE)
    if not txt:
        return []
    try:
        return json.loads(txt)
    except ValueError:
        return []


def wpath(p):
    try:
        rc, out, _ = run_cmd(["wslpath", "-w", p], 5)
        if rc == 0 and out.strip():
            return out.strip()
    except Unavailable:
        pass
    d = os.environ.get("WSL_DISTRO_NAME")
    return ("\\\\wsl.localhost\\%s%s" % (d, p.replace("/", "\\"))) if d else None


def read_flag(p):
    t = read_text(p, 200)
    return t.strip() if t is not None else None


def build_run(c, rid, rec, detail=False, g5=None, pruned=None):
    d = rec["dir"]
    out = {"id": rid, "source": rec["source"], "profile": rec["profile"], "dir": d, "incomplete": [], "read_errors": []}
    state = read_flag(os.path.join(d, "STATE"))
    if rec["source"] == "manual":
        state = "MANUAL"
    if state is None:
        out["incomplete"].append("STATE ausente")
        state = "DESCONHECIDO"
    out["state"] = state
    out["kind"] = read_flag(os.path.join(d, "KIND")) or rec["profile"]
    out["created"] = runid_time(rid)
    rj = None
    txt = read_text(os.path.join(d, "run.json"), 4096)
    if txt:
        try:
            rj = json.loads(txt)
        except ValueError:
            out["read_errors"].append("run.json inválido")
    elif rec["source"] == "queue" and state not in ("DRYRUN", "CAPTURING"):
        out["incomplete"].append("run.json ausente")
    out["run_json"] = rj
    out["finished"] = tinfo(rj.get("at")) if rj and rj.get("at") else None
    rcpt = tsv(os.path.join(d, "receipts.tsv"))
    if rcpt is None:
        if state not in ("DRYRUN",):
            out["incomplete"].append("receipts.tsv ausente")
        rcpt = []
    upl = tsv(os.path.join(d, "uploaded.tsv")) or []
    upl_by = {r.get("id"): r for r in upl}
    sdir = os.path.join(d, "state")
    objs = []
    superseded = {(r.get("id")) for r in (tsv(os.path.join(d, "receipts.superseded.tsv")) or [])}
    for r in rcpt:
        oid = r.get("id", "?")
        name = r.get("objeto", "")
        fpath = os.path.join(d, "objects", name) if name and "/" not in name else None
        size = None
        present = False
        if fpath:
            try:
                size = os.stat(fpath).st_size
                present = True
            except OSError:
                pass
        o = {"id": oid, "name": name, "path": fpath, "windows_path": wpath(fpath) if (detail and fpath) else None, "present": present,
             "size": size, "receipt_bytes": int(r["age_bytes"]) if (r.get("age_bytes") or "").isdigit() else None,
             "age_sha256": r.get("age_sha256"), "plain_sha256": r.get("plain_sha256"), "plain_bytes": r.get("plain_bytes"),
             "recipients": r.get("destinatarios_header"), "entries": r.get("entradas"), "created_utc": r.get("criado_utc")}
        o["size_matches"] = (present and o["size"] == o["receipt_bytes"]) if o["receipt_bytes"] is not None else None
        o["state_flags"] = {k: os.path.exists(os.path.join(sdir, "%s.%s" % (oid, k))) for k in ("put-attempt", "put-ok", "verified", "put-conflict")}
        u = upl_by.get(oid)
        if u:
            o["upload"] = {"key": u.get("objeto_s3"), "bytes": u.get("bytes"), "sha256": u.get("sha256"), "checksum_b64": u.get("checksum_b64"),
                           "version_id": u.get("version_id"), "put": tinfo(u.get("put_utc")), "verified": tinfo(u.get("verify_utc")), "mode": u.get("verify_modo")}
        else:
            o["upload"] = None
        if pruned and (rid, oid) in pruned:
            o["local_copy"] = "cópia local liberada (tombstone em state/pruned.tsv)"
        objs.append(o)
    out["objects"] = objs
    out["superseded_ids"] = sorted(x for x in superseded if x)
    try:
        out["rejected_files"] = sorted(os.listdir(os.path.join(d, "rejected")))
    except OSError:
        out["rejected_files"] = []
    # upload (separado da captura)
    if rec["source"] == "manual":
        rows = [r for r in (g5 or []) if r.get("snapshot") == rid]
        for o in objs:
            r = next((x for x in rows if (x.get("objeto_s3") or "").endswith(o["name"])), None)
            if r:
                o["upload"] = {"key": r.get("objeto_s3"), "bytes": r.get("bytes"), "sha256": r.get("sha256_recuperado"), "checksum_b64": r.get("checksum_s3_b64"),
                               "version_id": r.get("version_id"), "put": tinfo(r.get("put_utc")), "verified": tinfo(r.get("get_utc")), "mode": "G5: %s / %s" % (r.get("status_gravacao"), r.get("status_recuperacao"))}
        verified = sum(1 for o in objs if o["upload"])
        out["upload_state"] = "verificado (G5)" if objs and verified == len(objs) else ("parcial (G5)" if verified else "sem registro G5")
        out["capture_state"] = "capturado (manual G3)"
    else:
        flags_att = [o for o in objs if o["state_flags"]["put-attempt"] and not o["state_flags"]["put-ok"]]
        flags_conf = [o for o in objs if o["state_flags"]["put-conflict"]]
        nver = sum(1 for o in objs if o["state_flags"]["verified"])
        if state == "DRYRUN":
            out["capture_state"], out["upload_state"] = "simulação (dry-run, nada capturado)", "não aplicável"
        elif state == "NOOP":
            out["capture_state"], out["upload_state"] = "nada mudou (NOOP)", "não aplicável"
        elif state == "FAILED":
            out["capture_state"], out["upload_state"] = "FALHOU", "não enviado"
        elif state == "CAPTURING":
            out["capture_state"], out["upload_state"] = "capturando agora", "não enviado"
        elif state == "SUPERSEDED":
            out["capture_state"], out["upload_state"] = "capturado; objetos aposentados", "não aplicável"
        else:
            out["capture_state"] = "capturado"
            if flags_conf:
                out["upload_state"] = "CONFLITO 412 em %d objeto(s)" % len(flags_conf)
            elif flags_att:
                out["upload_state"] = "AMBÍGUO: PutObject sem confirmação em %d objeto(s) — conciliar" % len(flags_att)
            elif state == "UPLOADED_VERIFIED":
                out["upload_state"] = "verificado (%d/%d objetos)" % (nver, len(objs))
            elif state == "UPLOADING" or nver:
                out["upload_state"] = "parcial (%d/%d verificados)" % (nver, len(objs))
            else:
                out["upload_state"] = "NÃO enviado (só local)"
        out["ambiguous"] = bool(flags_att)
        out["conflict"] = bool(flags_conf)
    out["mb"] = run_mb(d, state) if rec["source"] == "queue" else du_mb(d)
    # contadores
    exp = EXPECTED.get(out["kind"], [])
    present_ids = [o["id"] for o in objs]
    out["expected_ids"] = exp
    out["missing_expected"] = [e for e in exp if not any(p.startswith(e) for p in present_ids)]
    if rj:
        manifest_extra = any(p.startswith("BA-07") for p in present_ids) and len(objs) == rj.get("captured", -1) + 1
        out["counters"] = {"captured": rj.get("captured"), "failed": rj.get("failed"), "skipped": rj.get("skipped"), "inconsistent": rj.get("inconsistent"),
                           "objects_with_receipt": len(objs), "manifest_not_counted": manifest_extra}
    else:
        out["counters"] = None
    if detail:
        out["dir_windows"] = wpath(d)
        out["objects_dir"] = os.path.join(d, "objects")
        out["objects_dir_windows"] = wpath(os.path.join(d, "objects"))
        out["receipts_path"] = os.path.join(d, "receipts.tsv")
        out["receipts_windows"] = wpath(out["receipts_path"])
        out["uploaded_path"] = os.path.join(d, "uploaded.tsv") if os.path.exists(os.path.join(d, "uploaded.tsv")) else None
        lg = os.path.join(c["BA_HOME"], "logs", rid + ".log") if rec["source"] == "queue" else os.path.join(d, "capture.log")
        out["log_path"] = lg
        out["log_tail"] = tail_bytes(lg, 16384)
        out["run_log_tail"] = tail_bytes(os.path.join(d, "run.log"), 4096)
        out["evidence"] = evidence_refs(c, rid)
        out["recovery"] = recovery_for(c, rid, objs)
    return out


_evid_cache = {}


def evidence_refs(c, rid):
    now = time.time()
    hit = _evid_cache.get(rid)
    if hit and now - hit[0] < 60:
        return hit[1]
    roots = []
    repo = REPO_OVERRIDE
    if not repo:
        try:
            sj = json.loads(read_text(c.get("BA_SOURCES_JSON", "")) or "{}")
            repo = sj.get("git_main")
        except ValueError:
            repo = None
    if repo:
        base = os.path.join(repo, "ops/evidence/latest")
        try:
            roots += [os.path.join(base, n) for n in sorted(os.listdir(base)) if n.startswith("backup-a-")]
        except OSError:
            pass
    ext = os.path.join(HOME, ".eiah-aws/evidence")
    try:
        roots += [os.path.join(ext, n) for n in sorted(os.listdir(ext)) if n.startswith(("backupA-", "backup-a-", "storage-02b"))]
    except OSError:
        pass
    found, scanned = [], 0
    for r in roots:
        for dp, dn, fn in os.walk(r):
            for f in fn:
                if not f.endswith((".md", ".txt", ".tsv", ".json", ".log")):
                    continue
                p = os.path.join(dp, f)
                scanned += 1
                if scanned > 800:
                    break
                try:
                    if os.path.getsize(p) > 1 << 20:
                        continue
                except OSError:
                    continue
                t = read_text(p)
                if t and rid in t:
                    found.append(p)
    res = {"files": found[:60], "scanned": scanned, "note": "busca textual pelo identificador do run em pastas de evidência BACKUP-A (limitada)"}
    _evid_cache[rid] = (now, res)
    return res


def recovery_for(c, rid, objs):
    ent = [e for e in recovery_entries() if e.get("run") == rid]
    res = []
    for o in objs:
        e = next((x for x in ent if x.get("object") == o["id"]), None)
        if e:
            ev = os.path.expanduser(e.get("evidence", ""))
            vid_ok = (not e.get("version_id")) or (o.get("upload") and o["upload"].get("version_id") == e.get("version_id"))
            res.append({"object": o["id"], "status": e.get("status") if (os.path.exists(ev) and vid_ok) else "referência de evidência ausente ou VersionId diferente — tratar como NÃO comprovada",
                        "evidence": e.get("evidence"), "scope": e.get("scope"), "source": e.get("source")})
        else:
            res.append({"object": o["id"], "status": "NÃO comprovada (nenhuma evidência específica de descriptografia/restauração deste objeto)", "evidence": None, "scope": None, "source": None})
    return res


# ------------------------------------------------------------------ systemd, disco, alertas
def systemd_props(unit, props):
    rc, out, err = run_cmd(["systemctl", "--user", "show", unit, "--no-pager"] + [x for p in props for x in ("-p", p)], 8)
    if rc != 0:
        raise Unavailable("systemctl show %s falhou" % unit)
    d = {}
    for l in out.splitlines():
        if "=" in l:
            k, v = l.split("=", 1)
            d[k] = v
    return d


def systemd_block():
    res = {"timers": {}, "services": {}, "errors": []}
    for t in TIMERS:
        kind = "daily" if "daily" in t else "weekly"
        try:
            p = systemd_props(t, ["ActiveState", "SubState", "UnitFileState", "Persistent", "LastTriggerUSec", "NextElapseUSecRealtime", "TimersCalendar", "ActiveEnterTimestamp"])
            m = re.search(r"OnCalendar=([^;]*?)\s*;", p.get("TimersCalendar", ""))
            res["timers"][kind] = {"unit": t, "enabled": p.get("UnitFileState"), "active": "%s/%s" % (p.get("ActiveState"), p.get("SubState")),
                                   "persistent": p.get("Persistent"), "calendar": m.group(1).strip() if m else None,
                                   "last_trigger": tinfo(p.get("LastTriggerUSec")), "last_trigger_original": p.get("LastTriggerUSec") or None,
                                   "next": tinfo(p.get("NextElapseUSecRealtime")), "loaded_since": tinfo(p.get("ActiveEnterTimestamp"))}
        except Unavailable as e:
            res["timers"][kind] = None
            res["errors"].append(str(e))
    for s in SERVICES:
        kind = "daily" if "daily" in s else "weekly"
        try:
            p = systemd_props(s, ["ActiveState", "SubState", "Result", "ExecMainStatus", "ExecMainStartTimestamp", "ExecMainExitTimestamp"])
            res["services"][kind] = {"unit": s, "active": "%s/%s" % (p.get("ActiveState"), p.get("SubState")), "result": p.get("Result"), "exit_code": p.get("ExecMainStatus"),
                                     "start": tinfo(p.get("ExecMainStartTimestamp")), "end": tinfo(p.get("ExecMainExitTimestamp")),
                                     "running": p.get("ActiveState") in ("active", "activating")}
        except Unavailable as e:
            res["services"][kind] = None
            res["errors"].append(str(e))
    try:
        rc, out, _ = run_cmd(["loginctl", "show-user", getpass.getuser(), "-p", "Linger", "--value"], 5)
        res["linger"] = out.strip() if rc == 0 and out.strip() else None
    except Unavailable:
        res["linger"] = None
    return res


def clock_block():
    try:
        rc, out, _ = run_cmd(["timedatectl", "show", "-p", "Timezone", "-p", "NTPSynchronized", "-p", "NTP"], 5)
        d = dict(l.split("=", 1) for l in out.splitlines() if "=" in l)
    except Unavailable:
        return {"available": False}
    proven = d.get("NTP") == "yes" and d.get("NTPSynchronized") == "yes"
    return {"available": True, "timezone": d.get("Timezone"), "ntp": d.get("NTP"), "ntp_synchronized": d.get("NTPSynchronized"),
            "status": "sincronizada via NTP (timedatectl)" if proven else "NÃO COMPROVADA",
            "note": "Conversão de fuso não comprova sincronização. Sem NTP ativo no WSL e com o serviço Windows Time parado em 2026-10-17 (evidência de tempo), a exatidão frente a UTC real não está comprovada."}


def df_block(path):
    rc, out, _ = run_cmd(["df", "-Pm", path], 8)
    l = out.splitlines()
    if rc != 0 or len(l) < 2:
        raise Unavailable("df %s falhou" % path)
    f = l[1].split()
    return {"path": path, "filesystem": f[0], "free_mb": int(f[3]), "used_pct": f[4], "mount": f[5]}


def alerts_block(c):
    d = os.path.join(c["BA_HOME"], "alerts")
    res = {"active": [], "recent": []}
    if not os.path.isdir(d):
        return res
    for n in sorted(os.listdir(d)):
        if n.startswith("ACTIVE-"):
            res["active"].append({"name": n, "text": (read_text(os.path.join(d, n), 400) or "").strip()})
    t = tail_bytes(os.path.join(d, "alerts.log"), 2048)
    if t:
        res["recent"] = t.strip().splitlines()[-5:]
    return res


def pgrep(pattern):
    try:
        rc, out, _ = run_cmd(["pgrep", "-f", pattern], 5)
    except Unavailable:
        return None
    return [int(x) for x in out.split() if x.isdigit() and int(x) != os.getpid()]


# ------------------------------------------------------------------ visão geral e histórico
_overview_cache = {"t": 0.0, "v": None}
_overview_lock = threading.Lock()


def collect_overview():
    c = conf()
    inv, src_info = sources(c)
    g5 = g5_rows(c)
    pruned = set()
    pr = tsv(os.path.join(c["BA_HOME"], "state", "pruned.tsv"))
    for r in (pr or []):
        pruned.add((r.get("run") or r.get("id"), r.get("id")))
    runs, srcs, qerr = [], [], []
    for rid, rec in inv.items():
        try:
            runs.append(build_run(c, rid, rec, False, g5, pruned))
        except Exception as e:  # leitura de um run falhou: aparece como erro por fonte, não como zero
            qerr.append("%s: %s" % (rid, e))
    runs.sort(key=lambda r: (r["created"] or {}).get("epoch", 0), reverse=True)
    counts = {}
    for r in runs:
        counts[r["state"]] = counts.get(r["state"], 0) + 1
    qmb = pend = other = amb = 0
    for r in runs:
        if r["source"] != "queue" or r["mb"] is None:
            continue
        if r["state"] == "UPLOADED_VERIFIED":
            amb += r["mb"]
        else:
            qmb += r["mb"]
            if r["state"] in ("CAPTURED", "UPLOADING"):
                pend += r["mb"]
            else:
                other += r["mb"]
    last_cap = next((r for r in runs if r["state"] in ("CAPTURED", "UPLOADING", "UPLOADED_VERIFIED", "NOOP", "FAILED", "CAPTURING") and r["source"] == "queue"), None)
    last_up = None
    for r in runs:
        for o in r["objects"]:
            u = o.get("upload")
            if u and u.get("verified") and (last_up is None or u["verified"]["epoch"] > last_up["verified"]["epoch"]):
                last_up = {"run": r["id"], "object": o["id"], "verified": u["verified"], "version_id": u.get("version_id"), "mode": u.get("mode"), "run_state": r["state"]}
    waiting = [r["id"] for r in runs if r["source"] == "queue" and r["state"] in ("CAPTURED", "UPLOADING")]
    ov = {"queried": now_info(), "config": {k: c.get(k) for k in ("BA_QUEUE_MAX_MB", "BA_ARCHIVE_MAX_MB", "BA_MIN_FREE_MB", "BA_BUCKET", "BA_REGION", "BA_PREFIX", "BA_SPACE_PATH")},
          "queue": {"queue_mb": qmb, "pending_mb": pend, "other_mb": other, "limit_mb": int(c["BA_QUEUE_MAX_MB"]), "pct": round(100.0 * qmb / max(1, int(c["BA_QUEUE_MAX_MB"])), 1),
                    "archive_mb": amb, "archive_limit_mb": int(c["BA_ARCHIVE_MAX_MB"])},
          "counts": counts, "total_runs": len(runs), "waiting_upload": waiting, "last_capture": ({"run": last_cap["id"], "state": last_cap["state"], "capture_state": last_cap["capture_state"], "created": last_cap["created"], "finished": last_cap["finished"], "counters": last_cap["counters"], "profile": last_cap["profile"]} if last_cap else None),
          "last_upload": last_up, "sources": src_info, "read_errors": qerr, "source_status": {}}
    st = ov["source_status"]
    for name, fn in (("systemd", systemd_block), ("clock", clock_block)):
        try:
            ov[name] = fn()
            st[name] = {"ok": True}
        except Unavailable as e:
            ov[name] = None
            st[name] = {"ok": False, "error": str(e)}
    try:
        ov["alerts"] = alerts_block(c)
        st["alerts"] = {"ok": True}
    except OSError as e:
        ov["alerts"] = None
        st["alerts"] = {"ok": False, "error": e.strerror}
    ov["disk"] = {}
    for name, p in (("queue_fs", c["BA_HOME"]), ("c_drive", c["BA_SPACE_PATH"])):
        try:
            ov["disk"][name] = df_block(p)
            st["disk_" + name] = {"ok": True}
        except Unavailable as e:
            ov["disk"][name] = None
            st["disk_" + name] = {"ok": False, "error": str(e)}
    st["queue"] = {"ok": not qerr and not any(s["error"] for s in src_info), "error": "; ".join(qerr + [s["error"] for s in src_info if s["error"]]) or None}
    cap = pgrep(r"backup-a(-run)?\.sh capture")
    upl = pgrep(r"backup-a\.sh (upload|reconcile)")
    ov["in_progress"] = {"capture_processes": cap, "upload_processes": upl,
                         "services_running": [k for k, v in ((ov["systemd"] or {}).get("services") or {}).items() if v and v["running"]],
                         "capturing_runs": [r["id"] for r in runs if r["state"] == "CAPTURING"], "job": JOBS.current_summary()}
    ov["session"] = SESSION.snapshot()
    ov["run_summaries"] = [slim(r) for r in runs]
    ov["login_command"] = LOGIN_CMD
    return ov


def slim(r):
    return {"id": r["id"], "profile": r["profile"], "source": r["source"], "state": r["state"], "capture_state": r["capture_state"], "upload_state": r["upload_state"],
            "created": r["created"], "finished": r["finished"], "mb": r["mb"], "objects": len(r["objects"]), "counters": r["counters"],
            "incomplete": r["incomplete"], "read_errors": r["read_errors"], "ambiguous": r.get("ambiguous", False), "conflict": r.get("conflict", False)}


def overview():
    with _overview_lock:
        if time.time() - _overview_cache["t"] < REFRESH_TTL_S and _overview_cache["v"] is not None:
            v = dict(_overview_cache["v"])
            v["session"] = SESSION.snapshot()
            v["in_progress"] = dict(v["in_progress"], job=JOBS.current_summary())
            return v
        v = collect_overview()
        _overview_cache.update(t=time.time(), v=v)
        return v


def runs_query(qs):
    ov = overview()
    items = ov["run_summaries"]

    def one(k, d=""):
        return (qs.get(k) or [d])[0]
    prof, st, q = one("profile"), one("state"), one("q").strip().lower()
    frm, to = one("from"), one("to")
    if prof:
        items = [r for r in items if r["profile"] == prof]
    if st:
        items = [r for r in items if r["state"] == st]
    if q:
        items = [r for r in items if q in r["id"].lower()]
    fe = epoch_of(frm + " 00:00:00 " + "-03:00") if re.match(r"^\d{4}-\d{2}-\d{2}$", frm) else None
    te = epoch_of(to + " 23:59:59 " + "-03:00") if re.match(r"^\d{4}-\d{2}-\d{2}$", to) else None
    if fe:
        items = [r for r in items if (r["created"] or {}).get("epoch", 0) >= fe]
    if te:
        items = [r for r in items if (r["created"] or {}).get("epoch", 0) <= te]
    asc = one("sort", "desc") == "asc"
    items = sorted(items, key=lambda r: (r["created"] or {}).get("epoch", 0), reverse=not asc)
    try:
        ps = max(5, min(100, int(one("page_size", "10"))))
        pg = max(1, int(one("page", "1")))
    except ValueError:
        ps, pg = 10, 1
    total = len(items)
    return {"total": total, "total_unfiltered": len(ov["run_summaries"]), "page": pg, "page_size": ps, "pages": max(1, -(-total // ps)),
            "items": items[(pg - 1) * ps: pg * ps], "sources": ov["sources"], "read_errors": ov["read_errors"], "queried": ov["queried"],
            "note": "Histórico = runs encontrados nas fontes locais acima. Não é o inventário do S3 (nenhuma consulta AWS)."}


def run_detail(rid):
    if not (RUN_RE.match(rid) or MAN_RE.match(rid)):
        return None
    c = conf()
    inv, _ = sources(c)
    rec = inv.get(rid)
    if not rec:
        return None
    pruned = set()
    for r in (tsv(os.path.join(c["BA_HOME"], "state", "pruned.tsv")) or []):
        pruned.add((r.get("run") or r.get("id"), r.get("id")))
    d = build_run(c, rid, rec, True, g5_rows(c), pruned)
    d["queried"] = now_info()
    d["counters_note"] = ("'capturados' conta apenas os objetos de dados processados no laço de captura (BA-01/02/06 no perfil diário). O manifesto BA-07 é gerado DEPOIS do laço, "
                          "só se capturados > 0, e fica fora do contador; ele tem recibo e arquivo próprios. Ignorados = objetos cujo fingerprint não mudou desde o último envio verificado.")
    d["upload_note"] = "Upload verificado = integridade do ciphertext no S3 (SHA-256, tamanho, VersionId). Não prova recuperação do conteúdo."
    d["inventory_note"] = "Hashes exibidos são os registrados nos recibos; não são recalculados."
    return d


# ------------------------------------------------------------------ AWS (somente por ação explícita)
def aws(args, timeout=45):
    c = conf()
    bin_ = c.get("BA_AWS_BIN")
    if bin_:
        cmd = [bin_] + args
    else:
        cmd = ["bash", "-c", 'source "$HOME/.eiah-aws/env.sh"; eiah_aws "$@"', "bash"] + args
    return run_cmd(cmd, timeout)


def mask_arn(arn):
    return arn.split(":", 5)[-1] if arn.count(":") >= 5 else arn.split(":")[-1]


class SessionState:
    def __init__(self):
        self.lock = threading.Lock()
        self.last = None

    def check(self):
        c = conf()
        want = [("operador", OPERATOR_PROFILE, "user/<IAM_PROFILE_OPERATOR>"), ("writer", c["BA_PROFILE_WRITER"], c["BA_ARN_WRITER"]), ("restore", c["BA_PROFILE_RESTORE"], c["BA_ARN_RESTORE"])]
        res = {}
        for label, prof, exp in want:
            try:
                rc, out, err = aws(["sts", "get-caller-identity", "--profile", prof, "--query", "Arn", "--output", "text"], 40)
            except Unavailable as e:
                res[label] = {"profile": prof, "ok": False, "status": "indisponível", "detail": str(e)}
                continue
            if rc != 0:
                expired = "expired" in err.lower() or "reauthenticate" in err.lower()
                res[label] = {"profile": prof, "ok": False, "status": "EXPIRADA" if expired else "erro", "detail": ("sessão expirada" if expired else err.strip().splitlines()[-1][:160] if err.strip() else "falha")}
            else:
                who = mask_arn(out.strip())
                good = exp in out
                res[label] = {"profile": prof, "ok": good, "status": "válida" if good else "IDENTIDADE INESPERADA", "identity": who}
        e = int(time.time())
        with self.lock:
            self.last = {"checked": fmt_epoch(e), "epoch": e, "profiles": res, "all_ok": all(v["ok"] for v in res.values())}
        return self.snapshot()

    def snapshot(self):
        with self.lock:
            if not self.last:
                return {"verified": False, "note": "sessão NÃO verificada nesta execução do dashboard"}
            age = int(time.time()) - self.last["epoch"]
            return dict(self.last, verified=True, age_s=age, fresh=age <= SESSION_MAX_AGE_S and self.last["all_ok"],
                        note="resultado da verificação feita em %s; vale apenas como foto daquele momento" % self.last["checked"]["brt"])


SESSION = SessionState()


# ------------------------------------------------------------------ plano e jobs de upload
PLAN_OBJ_RE = re.compile(r"^\s*\[(?P<id>[^\]]+)\] (?P<st>\S+) \| chave=(?P<key>\S+) \| (?P<bytes>\d+) B \| sha256=(?P<sha>[0-9a-f]{64}) \| checksum_b64 esperado=(?P<cs>\S+) \| (?P<chk>.*)$")


def script_env():
    return {"BA_CONF": CONF_PATH}


def file_sha(path):
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for b in iter(lambda: f.read(1 << 20), b""):
                h.update(b)
    except OSError:
        return None
    return h.hexdigest()


def compute_plan(rid):
    inv, _ = sources(conf())
    rec = inv.get(rid)
    if not rec or rec["source"] != "queue":
        raise ValueError("run inexistente no inventário da fila")
    state = read_flag(os.path.join(rec["dir"], "STATE"))
    if state not in ("CAPTURED", "UPLOADING"):
        raise ValueError("estado %s não permite envio (somente CAPTURED/UPLOADING)" % state)
    rc, out, err = run_cmd([SCRIPT, "upload", "--plan", "--run", rid, "--full-verify"], 60, script_env())
    if rc != 0:
        raise ValueError("plano falhou (código %d): %s" % (rc, (err or out).strip()[:300]))
    if "outra execução em andamento" in out:
        raise ValueError("BACKUP-A ocupado: outra execução (captura/upload) em andamento — o plano não pôde ser calculado; tente novamente depois")
    objs, header, bad = [], [], []
    for l in out.splitlines():
        m = PLAN_OBJ_RE.match(l)
        if m:
            o = m.groupdict()
            o["bytes"] = int(o["bytes"])
            if "ATENÇÃO" in l or "confere com o recibo" not in o["chk"]:
                bad.append(o["id"])
            objs.append(o)
        elif "ATENÇÃO" in l:
            bad.append(l.strip()[:120])
        else:
            header.append(l.rstrip())
    if not objs:
        raise ValueError("plano sem objetos pendentes")
    if bad:
        raise ValueError("plano com divergência local/recibo: %s" % ", ".join(bad))
    for o in objs:
        if not KEY_RE.match(o["key"]):
            raise ValueError("chave de destino inválida no plano")
    pending = [o for o in objs if o["st"] != "verificado"]
    canon = json.dumps({"run": rid, "state": state, "objs": [(o["id"], o["st"], o["key"], o["bytes"], o["sha"], o["cs"]) for o in objs], "header": header,
                        "script": file_sha(SCRIPT), "conf": file_sha(CONF_PATH), "receipts": file_sha(os.path.join(rec["dir"], "receipts.tsv"))}, sort_keys=True)
    return {"run": rid, "state": state, "objects": objs, "pending": pending, "pending_bytes": sum(o["bytes"] for o in pending), "header": header,
            "plan_hash": hashlib.sha256(canon.encode()).hexdigest(), "full_verify": True}


class PlanStore:
    def __init__(self):
        self.lock = threading.Lock()
        self.plans = {}

    def put(self, plan):
        pid = secrets.token_hex(12)
        with self.lock:
            now = time.time()
            self.plans = {k: v for k, v in self.plans.items() if now - v["t"] < PLAN_TTL_S}
            self.plans[pid] = {"t": now, "plan": plan, "consumed": False}
        return pid

    def consume(self, pid, plan_hash):
        with self.lock:
            e = self.plans.get(pid)
            if not e:
                return None, "plano desconhecido ou expirado — prepare e revise novamente"
            if e["consumed"]:
                return None, "este plano já foi usado (duplo disparo bloqueado)"
            if time.time() - e["t"] > PLAN_TTL_S:
                return None, "plano expirado — prepare e revise novamente"
            if e["plan"]["plan_hash"] != plan_hash:
                return None, "hash do plano não confere com o revisado"
            e["consumed"] = True
            return e["plan"], None


PLANS = PlanStore()


def action_log(kind, **kw):
    try:
        os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
        os.chmod(STATE_DIR, 0o700)
        kw.update(kind=kind, at_utc=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        with open(os.path.join(STATE_DIR, "actions.log"), "a") as f:
            f.write(json.dumps(kw, ensure_ascii=False) + "\n")
    except OSError:
        pass


class Jobs:
    """Um único job por vez; estado persistido para sobreviver ao fechamento da página e ao reinício do servidor."""

    def __init__(self):
        self.lock = threading.Lock()
        self.dir = os.path.join(STATE_DIR, "jobs")
        self.cur = None
        self.proc = None
        self._load()

    def _path(self, jid, ext):
        return os.path.join(self.dir, "%s.%s" % (jid, ext))

    def _save(self):
        if not self.cur:
            return
        os.makedirs(self.dir, mode=0o700, exist_ok=True)
        tmp = self._path(self.cur["id"], "json.tmp")
        with open(tmp, "w") as f:
            json.dump(self.cur, f)
        os.replace(tmp, self._path(self.cur["id"], "json"))

    def _load(self):
        try:
            names = sorted(n for n in os.listdir(self.dir) if n.endswith(".json"))
        except OSError:
            return
        if not names:
            return
        try:
            self.cur = json.loads(read_text(os.path.join(self.dir, names[-1])) or "null")
        except ValueError:
            self.cur = None
        if self.cur and self.cur.get("status") == "running":
            pid = self.cur.get("pid")
            if pid and os.path.exists("/proc/%d" % pid) and "backup-a.sh" in (read_text("/proc/%d/cmdline" % pid, 2000) or ""):
                self.cur["status"] = "running_untracked"
                self.cur["note"] = "o dashboard foi reiniciado; o processo segue em execução mas o código de saída não será capturado"
            else:
                self.cur["status"] = "indeterminate"
                self.cur["note"] = "acompanhamento perdido (servidor reiniciado): estado INDETERMINADO até reconciliar os recibos"
            self._save()

    def busy(self):
        s = (self.cur or {}).get("status")
        if s == "running":
            return True
        if s == "running_untracked":
            pid = self.cur.get("pid")
            if pid and os.path.exists("/proc/%d" % pid):
                return True
            self.cur["status"] = "indeterminate"
            self.cur["note"] = "o processo terminou sem acompanhamento: INDETERMINADO até reconciliar os recibos"
            self._save()
        return False

    def start(self, kind, run_id, plan_hash, args):
        with self.lock:
            if self.busy():
                return None, "outra operação do dashboard está em andamento"
            others = (pgrep(r"backup-a(-run)?\.sh capture") or []) + (pgrep(r"backup-a\.sh (upload|reconcile)") or [])
            if others:
                return None, "há captura/upload/conciliação em andamento fora do dashboard (pids %s); aguarde" % others
            jid = time.strftime("%Y%m%dT%H%M%S", time.gmtime()) + "-" + secrets.token_hex(3)
            os.makedirs(self.dir, mode=0o700, exist_ok=True)
            logf = open(self._path(jid, "log"), "wb")
            try:
                proc = subprocess.Popen([SCRIPT] + args, stdout=logf, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, env=dict(os.environ, **script_env()), start_new_session=True)
            except OSError as e:
                logf.close()
                return None, "falha ao iniciar: %s" % e.strerror
            logf.close()
            self.cur = {"id": jid, "kind": kind, "run": run_id, "plan_hash": plan_hash, "args": args, "pid": proc.pid, "status": "running",
                        "started": fmt_epoch(int(time.time())), "ended": None, "exit_code": None, "result": None, "note": None}
            self.proc = proc
            self._save()
            action_log("job_start", job=jid, job_kind=kind, run=run_id, plan_hash=plan_hash, pid=proc.pid)
            threading.Thread(target=self._wait, args=(jid, proc), daemon=True).start()
            return dict(self.cur), None

    def _wait(self, jid, proc):
        rc = proc.wait()
        with self.lock:
            if not self.cur or self.cur["id"] != jid:
                return
            self.cur.update(status="finished", exit_code=rc, ended=fmt_epoch(int(time.time())))
            self.cur["result"] = self._evaluate(self.cur, rc)
            self._save()
            action_log("job_end", job=jid, exit_code=rc, result=self.cur["result"]["verdict"])

    def _evaluate(self, job, rc):
        run = job.get("run")
        res = {"exit_code": rc, "exit_meaning": {0: "ok", 2: "pré-condição", 3: "parcial/conflito/divergência", 75: "sessão AWS expirada", 76: "PutObject ambíguo — conciliar", 77: "espaço/fila", 78: "uso"}.get(rc, "outro")}
        if job["kind"] == "reconcile":
            res["verdict"] = "conciliação concluída" if rc == 0 else "conciliação com pendência (código %d)" % rc
            return res
        try:
            inv, _ = sources(conf())
            r = build_run(conf(), run, inv[run], True, None, None)
            ver = [o for o in r["objects"] if o["state_flags"]["verified"]]
            res.update(run_state=r["state"], verified_objects=len(ver), total_objects=len(r["objects"]), upload_state=r["upload_state"])
            ok = rc == 0 and r["state"] == "UPLOADED_VERIFIED" and len(ver) == len(r["objects"]) and all(o["upload"] and o["upload"].get("mode") == "download-completo" for o in r["objects"])
            if ok:
                res["verdict"] = "VERIFICADO: %d/%d objetos por download completo" % (len(ver), len(r["objects"]))
            elif rc == 0:
                res["verdict"] = "NADA CONFIRMADO: o script saiu 0 mas o run não está UPLOADED_VERIFIED (possível lock/concorrência) — conferir recibos"
            elif rc == 76 or r.get("ambiguous"):
                res["verdict"] = "AMBÍGUO: não repetir o PUT; use Conciliar (somente leitura no S3)"
            elif rc == 75:
                res["verdict"] = "SESSÃO AWS EXPIRADA: nada foi enviado após a falha; refaça o login humano"
            elif r.get("conflict"):
                res["verdict"] = "CONFLITO 412: chave já existia, nada sobrescrito"
            else:
                res["verdict"] = "FALHOU (código %d); ver log" % rc
            res["evidence_hint"] = {"receipts": r["receipts_path"], "uploaded": r.get("uploaded_path"), "log": r["log_path"]}
        except Exception as e:  # noqa
            res["verdict"] = "não foi possível avaliar os recibos: %s" % e
        return res

    def current_summary(self):
        with self.lock:
            if not self.cur:
                return None
            self.busy()
            c = dict(self.cur)
        c["log_tail"] = tail_bytes(self._path(c["id"], "log"), 6000)
        return c


JOBS = Jobs()


# ------------------------------------------------------------------ HTTP
CT = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}
STATIC_ROUTES = {"/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/app.css": "app.css"}
TOKEN = secrets.token_urlsafe(32)
PORT = {"n": 0}


class Handler(BaseHTTPRequestHandler):
    server_version = "BAD/1"
    sys_version = ""
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *a):  # sem query string, sem cabeçalhos, sem token
        try:
            os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
            with open(os.path.join(STATE_DIR, "access.log"), "a") as f:
                f.write("%s %s %s\n" % (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), self.command, urlparse(self.path).path))
        except OSError:
            pass

    # --- helpers
    def allowed_hosts(self):
        return {"127.0.0.1:%d" % PORT["n"], "localhost:%d" % PORT["n"]}

    def send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def err(self, code, msg):
        self.send(code, {"error": msg})

    def host_ok(self):
        return self.headers.get("Host", "") in self.allowed_hosts()

    # --- métodos
    def do_GET(self):
        if not self.host_ok():
            return self.err(403, "Host inválido")
        u = urlparse(self.path)
        p = u.path
        if p in STATIC_ROUTES:
            fn = os.path.join(STATIC, STATIC_ROUTES[p])
            try:
                with open(fn, "rb") as f:
                    return self.send(200, f.read(), CT[os.path.splitext(fn)[1]])
            except OSError:
                return self.err(404, "não encontrado")
        qs = parse_qs(u.query, max_num_fields=20)
        try:
            if p == "/api/session":
                return self.send(200, {"token": TOKEN, "now": now_info(), "port": PORT["n"]})
            if p == "/api/overview":
                return self.send(200, overview())
            if p == "/api/runs":
                return self.send(200, runs_query(qs))
            m = re.match(r"^/api/run/([A-Za-z0-9\-]{10,80})$", p)
            if m:
                d = run_detail(m.group(1))
                return self.send(200, d) if d else self.err(404, "run não encontrado no inventário local")
            if p == "/api/job":
                return self.send(200, {"job": JOBS.current_summary(), "queried": now_info()})
        except Unavailable as e:
            return self.err(503, "não disponível: %s" % e)
        except Exception as e:  # noqa
            return self.err(500, "erro interno: %s" % type(e).__name__)
        return self.err(404, "não encontrado")

    def do_POST(self):
        if not self.host_ok():
            return self.err(403, "Host inválido")
        origin = self.headers.get("Origin", "")
        if origin not in {"http://" + h for h in self.allowed_hosts()}:
            return self.err(403, "Origin inválida")
        if not hmac.compare_digest(self.headers.get("X-BA-Token", ""), TOKEN):
            return self.err(403, "token ausente ou inválido")
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return self.err(415, "use application/json")
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.err(400, "Content-Length inválido")
        if n > 4096:
            return self.err(413, "corpo grande demais")
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self.err(400, "JSON inválido")
        if not isinstance(body, dict):
            return self.err(400, "JSON inválido")
        p = urlparse(self.path).path
        try:
            if p == "/api/aws/session":
                action_log("session_check")
                return self.send(200, SESSION.check())
            if p == "/api/upload/plan":
                return self.send(*self.h_plan(body))
            if p == "/api/upload/execute":
                return self.send(*self.h_execute(body))
            if p == "/api/upload/reconcile":
                return self.send(*self.h_reconcile(body))
        except Unavailable as e:
            return self.err(503, "não disponível: %s" % e)
        except Exception as e:  # noqa
            return self.err(500, "erro interno: %s" % type(e).__name__)
        return self.err(404, "não encontrado")

    def do_PUT(self):
        self.err(405, "método não permitido")

    do_DELETE = do_PATCH = do_PUT

    def do_OPTIONS(self):  # sem CORS
        self.err(405, "método não permitido")

    # --- ações
    def valid_run(self, body):
        rid = body.get("run_id")
        if not isinstance(rid, str) or not RUN_RE.match(rid):
            return None
        inv, _ = sources(conf())
        return rid if rid in inv else None

    def h_plan(self, body):
        rid = self.valid_run(body)
        if not rid:
            return 400, {"error": "run inválido ou fora do inventário local"}
        try:
            plan = compute_plan(rid)
        except ValueError as e:
            return 409, {"error": str(e)}
        plan["remote_check"] = None
        if body.get("remote_check") is True:
            sess = SESSION.check()
            plan["session"] = sess
            if not sess.get("all_ok"):
                plan["remote_check"] = {"done": False, "reason": "sessões AWS não estão todas válidas; consulta remota não realizada"}
            else:
                c = conf()
                res = []
                for o in plan["pending"]:
                    rc, out, err = aws(["s3api", "head-object", "--profile", c["BA_PROFILE_RESTORE"], "--region", c["BA_REGION"], "--bucket", c["BA_BUCKET"], "--key", o["key"], "--checksum-mode", "ENABLED"], 40)
                    if rc == 0:
                        res.append({"id": o["id"], "status": "JÁ EXISTE no S3 (envio bloqueado)"})
                    elif "404" in err or "Not Found" in err:
                        res.append({"id": o["id"], "status": "ausente (404) — chave livre"})
                    else:
                        res.append({"id": o["id"], "status": "não foi possível conferir", "detail": err.strip()[-120:]})
                plan["remote_check"] = {"done": True, "objects": res, "at": now_info()}
        plan["plan_id"] = PLANS.put(plan)
        plan["bucket"], plan["region"] = conf()["BA_BUCKET"], conf()["BA_REGION"]
        plan["confirm_phrase"] = "ENVIAR " + rid
        plan["prepared"] = now_info()
        action_log("plan", run=rid, plan_hash=plan["plan_hash"], remote_check=bool(body.get("remote_check")))
        return 200, plan

    def h_execute(self, body):
        rid = self.valid_run(body)
        if not rid:
            return 400, {"error": "run inválido ou fora do inventário local"}
        if body.get("confirm") != "ENVIAR " + rid:
            return 400, {"error": "confirmação explícita ausente ou diferente da frase exigida"}
        pid, ph = body.get("plan_id"), body.get("plan_hash")
        if not (isinstance(pid, str) and isinstance(ph, str)):
            return 400, {"error": "plan_id/plan_hash ausentes"}
        with PLANS.lock:
            e = PLANS.plans.get(pid)
            if e and e["plan"]["run"] != rid:
                return 400, {"error": "o plano pertence a outro run"}
        if JOBS.busy():
            return 409, {"error": "outra operação do dashboard está em andamento (um único upload por vez)"}
        sess = SESSION.snapshot()
        if not sess.get("verified") or not sess.get("fresh"):
            return 409, {"error": "sessão AWS não verificada recentemente (ou inválida): use 'Verificar sessão AWS' e, se necessário, faça o login humano", "session": sess}
        plan, why = PLANS.consume(pid, ph)
        if not plan:
            return 409, {"error": why}
        rc_ = plan.get("remote_check") or {}
        if rc_.get("done") and any("JÁ EXISTE" in (x.get("status") or "") for x in rc_.get("objects", [])):
            return 409, {"error": "a conferência remota achou chave já existente: envio bloqueado; reconcilie/investigue (nada sobrescrito)", "needs_new_review": True}
        try:
            fresh = compute_plan(rid)
        except ValueError as ex:
            return 409, {"error": "revalidação falhou: %s" % ex, "needs_new_review": True}
        if fresh["plan_hash"] != plan["plan_hash"]:
            return 409, {"error": "o plano mudou entre a preparação e a execução: revise e confirme novamente", "needs_new_review": True}
        job, why = JOBS.start("upload", rid, plan["plan_hash"], ["upload", "--run", rid, "--full-verify"])
        if not job:
            return 409, {"error": why}
        return 202, {"job": job}

    def h_reconcile(self, body):
        if body.get("confirm") != "CONCILIAR":
            return 400, {"error": "confirmação explícita ausente"}
        sess = SESSION.snapshot()
        if not sess.get("verified") or not sess.get("fresh"):
            return 409, {"error": "sessão AWS não verificada recentemente (ou inválida)", "session": sess}
        job, why = JOBS.start("reconcile", None, None, ["reconcile"])
        if not job:
            return 409, {"error": why}
        return 202, {"job": job}


def pick_port(preferred):
    for p in list(range(preferred, preferred + 16)) + [0]:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", p))
            return s.getsockname()[1]
        except OSError:
            continue
        finally:
            s.close()
    raise SystemExit("nenhuma porta livre")


def main():
    port = pick_port(int(os.environ.get("BAD_PORT", "8765")))
    PORT["n"] = port
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    srv.daemon_threads = True
    os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
    with open(os.path.join(STATE_DIR, "server.json"), "w") as f:
        json.dump({"pid": os.getpid(), "port": port, "url": "http://127.0.0.1:%d/" % port, "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, f)
    os.chmod(os.path.join(STATE_DIR, "server.json"), 0o600)
    print("BACKUP-A dashboard em http://127.0.0.1:%d/ (somente loopback)" % port, flush=True)
    signal.signal(signal.SIGTERM, lambda *a: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        try:
            os.remove(os.path.join(STATE_DIR, "server.json"))
        except OSError:
            pass


if __name__ == "__main__":
    main()
