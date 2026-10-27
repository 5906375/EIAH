#!/usr/bin/env python3
"""Testes do dashboard BACKUP-A com doubles (mock-aws): nenhuma chamada AWS real. Ordem importa (test_NN)."""
import os, sys, json, time, subprocess, threading, unittest, http.client, re, signal, shutil, hashlib

T = os.environ["T"]; BA = os.environ["BA"]; HERE = os.path.dirname(os.path.abspath(__file__)); DASH = os.path.dirname(HERE)
SERVER = os.path.join(DASH, "server.py"); MOCK = os.environ["MOCK_STORE"]
SERVERS = {}


def start(name, port, conf, extra=None, state=None):
    st = state or os.path.join(T, "dstate-" + name)
    env = dict(os.environ, BAD_CONF=conf, BAD_BACKUP_A_SH=BA, BAD_STATE_DIR=st, BAD_PORT=str(port), BAD_RECOVERY_FILE=os.path.join(T, "no-recovery.json"))
    env.update(extra or {})
    p = subprocess.Popen([sys.executable, "-I", SERVER], env=env, stdout=open(os.path.join(T, "srv-%s.log" % name), "ab"), stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
    for _ in range(80):
        time.sleep(0.1)
        try:
            d = json.load(open(os.path.join(st, "server.json")))
            if d["pid"] == p.pid:
                SERVERS[name] = {"p": p, "port": d["port"], "state": st, "conf": conf}
                return SERVERS[name]
        except (OSError, ValueError, KeyError):
            pass
    raise RuntimeError("servidor não subiu: " + name)


def stop(name, sig=signal.SIGTERM):
    s = SERVERS.pop(name, None)
    if s:
        s["p"].send_signal(sig)
        try:
            s["p"].wait(10)
        except subprocess.TimeoutExpired:
            s["p"].kill()


def req(srv, method, path, body=None, headers=None, host=None, token=None, origin="auto", raw=None):
    c = http.client.HTTPConnection("127.0.0.1", srv["port"], timeout=60)
    h = {"Host": host or "127.0.0.1:%d" % srv["port"]}
    if method == "POST":
        h["Content-Type"] = "application/json"
        if origin == "auto":
            h["Origin"] = "http://127.0.0.1:%d" % srv["port"]
        elif origin:
            h["Origin"] = origin
        if token:
            h["X-BA-Token"] = token
    h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body or {}) if method == "POST" else None)
    c.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
    for k, v in h.items():
        c.putheader(k, v)
    if data is not None:
        c.putheader("Content-Length", str(len(data)))
    c.endheaders()
    if data is not None:
        c.send(data.encode() if isinstance(data, str) else data)
    r = c.getresponse()
    b = r.read()
    try:
        j = json.loads(b)
    except ValueError:
        j = None
    hd = {k.lower(): v for k, v in r.getheaders()}
    c.close()
    return r.status, j, hd, b


def token(srv):
    return req(srv, "GET", "/api/session")[1]["token"]


def sh(cmd, **kw):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, **kw)


def tree_snapshot(root):
    out = []
    for dp, dn, fn in os.walk(root):
        for n in sorted(dn + fn):
            p = os.path.join(dp, n)
            try:
                st = os.lstat(p)
                out.append("%s %d %d %d" % (p, st.st_size, st.st_mtime_ns, st.st_ctime_ns))
            except OSError:
                pass
    return hashlib.sha256("\n".join(sorted(out)).encode()).hexdigest()


def runs():
    q = os.path.join(T, "auto", "queue")
    return sorted(os.listdir(q))


def puts():
    p = os.path.join(MOCK, "puts.log")
    return open(p).read().split() if os.path.exists(p) else []


def calls():
    p = os.path.join(MOCK, "calls.log")
    return open(p).read().splitlines() if os.path.exists(p) else []


class D(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main = start("main", 18765, os.path.join(T, "backup-a.env"))
        cls.R = runs()

    @classmethod
    def tearDownClass(cls):
        for n in list(SERVERS):
            stop(n)

    # ---------- bind, cabeçalhos, consultas
    def test_01_bind_loopback_only(self):
        out = sh(["ss", "-ltnH"]).stdout
        mine = [l for l in out.splitlines() if (":%d " % self.main["port"]) in l]
        self.assertTrue(mine, out)
        for l in mine:
            self.assertIn("127.0.0.1:%d" % self.main["port"], l)
            self.assertNotIn("0.0.0.0:%d" % self.main["port"], l)
            self.assertNotIn("[::]", l)

    def test_02_get_routes_no_aws_no_changes(self):
        before_calls = len(calls())
        snap_ba = tree_snapshot(os.path.join(T, "auto"))
        snap_dash = tree_snapshot(DASH)
        for p in ["/", "/app.js", "/app.css", "/api/session", "/api/overview", "/api/runs", "/api/runs?profile=daily&page=1", "/api/job", "/api/run/" + self.R[0]] * 3:
            st, j, h, b = req(self.main, "GET", p)
            self.assertEqual(st, 200, p)
            self.assertEqual(h["cache-control"], "no-store")
            self.assertIn("default-src 'none'", h["content-security-policy"])
            self.assertNotIn("access-control-allow-origin", h)
        self.assertEqual(len(calls()), before_calls, "GET fez chamada AWS (mock)")
        self.assertFalse(os.path.exists(os.path.join(T, "real-aws-calls.log")), "aws REAL foi invocado")
        self.assertEqual(snap_ba, tree_snapshot(os.path.join(T, "auto")), "GET alterou a árvore do BACKUP-A")
        self.assertEqual(snap_dash, tree_snapshot(DASH), "GET alterou os arquivos do dashboard")

    def test_03_host_origin_csrf(self):
        s = self.main
        self.assertEqual(req(s, "GET", "/api/overview", host="evil.example:%d" % s["port"])[0], 403)
        self.assertEqual(req(s, "GET", "/", host="127.0.0.1:1")[0], 403)
        tk = token(s)
        self.assertEqual(req(s, "POST", "/api/aws/session", token=None)[0], 403)
        self.assertEqual(req(s, "POST", "/api/aws/session", token="x" * 20)[0], 403)
        self.assertEqual(req(s, "POST", "/api/aws/session", token=tk, origin="http://evil.example")[0], 403)
        self.assertEqual(req(s, "POST", "/api/aws/session", token=tk, origin=None)[0], 403)
        self.assertEqual(req(s, "POST", "/api/aws/session", token=tk, host="evil.example:%d" % s["port"])[0], 403)
        self.assertEqual(req(s, "POST", "/api/aws/session", token=tk, headers={"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(req(s, "POST", "/api/upload/plan", token=tk, raw="x" * 5000)[0], 413)
        self.assertEqual(req(s, "POST", "/api/upload/plan", token=tk, raw="{nao json")[0], 400)
        for m in ("PUT", "DELETE", "PATCH", "OPTIONS"):
            c = http.client.HTTPConnection("127.0.0.1", s["port"]); c.request(m, "/api/overview", headers={"Host": "127.0.0.1:%d" % s["port"]}); r = c.getresponse(); r.read()
            self.assertIn(r.status, (405, 501), m)
            self.assertIsNone(r.getheader("Access-Control-Allow-Origin"))
        # efeitos só por POST: GET em rota de ação não existe
        self.assertEqual(req(s, "GET", "/api/aws/session")[0], 404)
        self.assertEqual(req(s, "GET", "/api/upload/execute")[0], 404)
        self.assertEqual(len(calls()), 0, "rejeições não podem chamar AWS")

    def test_04_paths_and_run_ids(self):
        s = self.main
        for p in ["/../server.py", "/static/../server.py", "/etc/passwd", "/server.py", "/recovery-evidence.json", "/api/run/..%2f..%2fetc%2fpasswd", "/api/run/BA-AUTO-daily-20250101T000000000Z-aaaaaa", "/api/run/BA-AUTO-daily-20250101T000000000Z-aaaaaa/../x", "/api/run/%00"]:
            self.assertIn(req(s, "GET", p)[0], (400, 404), p)
        tk = token(s)
        for bad in ["../../etc", "BA-AUTO-daily-20250101T000000000Z-aaaaaa", "BA-AUTO-daily-20261017T110000746Z-7c3750; rm -rf /", 5, None, ["x"]]:
            st, j, _, _ = req(s, "POST", "/api/upload/plan", {"run_id": bad}, token=tk)
            self.assertEqual(st, 400, bad)
        st, j, _, _ = req(s, "POST", "/api/upload/execute", {"run_id": "../x", "plan_id": "a", "plan_hash": "b", "confirm": "x"}, token=tk)
        self.assertEqual(st, 400)
        self.assertEqual(len(puts()), 0)

    def test_05_overview_matches_sources(self):
        ov = req(self.main, "GET", "/api/overview")[1]
        st = sh([BA, "status"], env=dict(os.environ)).stdout
        m = re.search(r"fila não enviada: (\d+) MB \(máx (\d+)\) \| arquivo verificado local: (\d+) MB", st)
        self.assertIsNotNone(m, st)
        self.assertEqual((ov["queue"]["queue_mb"], ov["queue"]["limit_mb"], ov["queue"]["archive_mb"]), tuple(int(x) for x in m.groups()))
        self.assertEqual(ov["counts"].get("CAPTURED"), len(self.R))
        self.assertEqual(sorted(ov["waiting_upload"]), sorted(self.R))
        self.assertTrue(ov["last_capture"]["state"] == "CAPTURED")
        self.assertIsNone(ov["last_upload"])
        self.assertFalse(ov["session"]["verified"])          # nada de autenticação antiga como atual
        self.assertEqual(ov["clock"]["status"], "NÃO COMPROVADA" if ov["clock"].get("ntp") != "yes" else ov["clock"]["status"])
        t = ov["systemd"]["timers"]
        for k, unit in (("daily", "backup-a-capture-daily.timer"), ("weekly", "backup-a-capture-weekly.timer")):
            real = sh(["systemctl", "--user", "show", unit, "-p", "UnitFileState", "-p", "Persistent", "-p", "ActiveState", "--no-pager"]).stdout
            self.assertIn("UnitFileState=" + t[k]["enabled"], real)
            self.assertIn("Persistent=" + t[k]["persistent"], real)
            self.assertIn("America/Sao_Paulo", t[k]["calendar"])
            self.assertEqual(t[k]["next"]["brt"][-6:], "-03:00")
            self.assertTrue(t[k]["next"]["utc"].endswith("Z"))
        self.assertEqual(ov["disk"]["queue_fs"]["free_mb"] > 0, True)
        self.assertNotEqual(ov["disk"]["queue_fs"]["mount"], None)

    def test_06_time_equivalence(self):
        sys.path.insert(0, DASH)
        os.environ["BAD_CONF"] = os.path.join(T, "backup-a.env")
        import importlib
        srv = importlib.import_module("server")
        a = srv.tinfo("2026-10-17T11:00:00Z")
        b = srv.tinfo("2026-10-17T08:00:00-03:00")
        self.assertEqual(a["epoch"], b["epoch"])
        self.assertEqual(a["brt"], "2026-10-17T08:00:00-03:00"); self.assertEqual(a["utc"], "2026-10-17T11:00:00Z")
        c = srv.tinfo("Sat 2026-10-17 08:00:00 -03")
        self.assertEqual(c["utc"], "2026-10-17T11:00:00Z")
        self.assertIsNone(srv.tinfo("não é data"))

    def test_07_history_filters_and_detail(self):
        s = self.main
        j = req(s, "GET", "/api/runs?page_size=5&sort=asc")[1]
        self.assertEqual(j["total"], len(self.R)); self.assertEqual(j["items"][0]["id"], self.R[0])
        self.assertEqual(req(s, "GET", "/api/runs?q=" + self.R[1][-6:])[1]["total"], 1)
        self.assertEqual(req(s, "GET", "/api/runs?state=UPLOADED_VERIFIED")[1]["total"], 0)
        self.assertEqual(req(s, "GET", "/api/runs?profile=weekly")[1]["total"], 0)
        self.assertEqual(req(s, "GET", "/api/runs?from=2099-01-01")[1]["total"], 0)
        self.assertEqual(req(s, "GET", "/api/runs?page_size=1&page=2")[1]["page"], 2)
        self.assertTrue(j["sources"])
        d = req(s, "GET", "/api/run/" + self.R[0])[1]
        self.assertEqual(d["state"], "CAPTURED"); self.assertEqual(d["upload_state"], "NÃO enviado (só local)")
        self.assertTrue(all(o["size_matches"] for o in d["objects"]))
        self.assertTrue(d["objects_dir_windows"].startswith("\\\\wsl"))
        self.assertTrue(d["counters"]["manifest_not_counted"])
        self.assertIn("NÃO comprovada", d["recovery"][0]["status"])
        self.assertNotIn("password", json.dumps(d).lower())

    # ---------- sessão e upload
    def test_08_execute_requires_fresh_session(self):
        s = self.main; tk = token(s); rid = self.R[0]
        st, pl, _, _ = req(s, "POST", "/api/upload/plan", {"run_id": rid}, token=tk)
        self.assertEqual(st, 200, pl)
        self.assertEqual(pl["state"], "CAPTURED"); self.assertEqual(len(pl["pending"]), len(pl["objects"]))
        self.assertIsNone(pl["remote_check"])
        self.assertEqual(len(calls()), 0, "plano sem remote_check não pode chamar AWS")
        st, j, _, _ = req(s, "POST", "/api/upload/execute", {"run_id": rid, "plan_id": pl["plan_id"], "plan_hash": pl["plan_hash"], "confirm": "ENVIAR " + rid}, token=tk)
        self.assertEqual(st, 409); self.assertIn("sessão", j["error"])
        self.assertEqual(len(puts()), 0)

    def test_09_session_check_and_remote_plan(self):
        s = self.main; tk = token(s)
        st, j, _, _ = req(s, "POST", "/api/aws/session", {}, token=tk)
        self.assertEqual(st, 200); self.assertTrue(j["all_ok"], j)
        self.assertEqual(set(j["profiles"]), {"operador", "writer", "restore"})
        self.assertNotIn("123456789012", json.dumps(j))           # conta mascarada
        self.assertTrue(j["checked"]["utc"].endswith("Z"))
        ov = req(s, "GET", "/api/overview")[1]
        self.assertTrue(ov["session"]["verified"] and ov["session"]["fresh"])
        n0 = len(calls())
        st, pl, _, _ = req(s, "POST", "/api/upload/plan", {"run_id": self.R[0], "remote_check": True}, token=tk)
        self.assertEqual(st, 200)
        self.assertTrue(pl["remote_check"]["done"]); self.assertTrue(all("ausente" in o["status"] for o in pl["remote_check"]["objects"]))
        self.assertTrue(all("head-object" in l or "sts" in l for l in calls()[n0:]))
        self.assertEqual(len(puts()), 0)

    def test_10_wrong_confirmation_and_unknown_plan(self):
        s = self.main; tk = token(s); rid = self.R[0]
        pl = req(s, "POST", "/api/upload/plan", {"run_id": rid}, token=tk)[1]
        base = {"run_id": rid, "plan_id": pl["plan_id"], "plan_hash": pl["plan_hash"]}
        self.assertEqual(req(s, "POST", "/api/upload/execute", dict(base, confirm="enviar"), token=tk)[0], 400)
        self.assertEqual(req(s, "POST", "/api/upload/execute", dict(base, confirm="ENVIAR " + rid, plan_hash="0" * 64), token=tk)[0], 409)
        self.assertEqual(req(s, "POST", "/api/upload/execute", dict(base, plan_id="nope", confirm="ENVIAR " + rid), token=tk)[0], 409)
        self.assertEqual(req(s, "POST", "/api/upload/execute", dict(base, run_id=self.R[1], confirm="ENVIAR " + self.R[1]), token=tk)[0], 400)
        self.assertEqual(len(puts()), 0)

    def wait_job(self, srv, timeout=120):
        end = time.time() + timeout
        while time.time() < end:
            j = req(srv, "GET", "/api/job")[1]["job"]
            if j and j["status"] not in ("running", "running_untracked"):
                return j
            time.sleep(0.5)
        self.fail("job não terminou")

    def test_11_happy_upload_only_selected_run(self):
        s = self.main; tk = token(s); rid = self.R[0]
        pl = req(s, "POST", "/api/upload/plan", {"run_id": rid}, token=tk)[1]
        p0 = len(puts())
        st, j, _, _ = req(s, "POST", "/api/upload/execute", {"run_id": rid, "plan_id": pl["plan_id"], "plan_hash": pl["plan_hash"], "confirm": "ENVIAR " + rid}, token=tk)
        self.assertEqual(st, 202, j)
        job = self.wait_job(s)
        self.assertEqual(job["status"], "finished"); self.assertEqual(job["exit_code"], 0)
        self.assertTrue(job["result"]["verdict"].startswith("VERIFICADO"), job["result"])
        self.assertEqual(open(os.path.join(T, "auto", "queue", rid, "STATE")).read().strip(), "UPLOADED_VERIFIED")
        new = puts()[p0:]
        self.assertEqual(len(new), len(pl["objects"])); self.assertTrue(all(("/" + rid + "/") in k for k in new), new)
        for other in self.R[1:]:
            self.assertEqual(open(os.path.join(T, "auto", "queue", other, "STATE")).read().strip(), "CAPTURED")   # nenhum outro run enviado
        d = req(s, "GET", "/api/run/" + rid)[1]
        self.assertTrue(all(o["upload"]["mode"] == "download-completo" and o["upload"]["version_id"] for o in d["objects"]))
        self.assertTrue(job["result"]["evidence_hint"]["receipts"].endswith("receipts.tsv"))
        # reuso do mesmo plano / novo plano para run já verificado
        st, j, _, _ = req(s, "POST", "/api/upload/execute", {"run_id": rid, "plan_id": pl["plan_id"], "plan_hash": pl["plan_hash"], "confirm": "ENVIAR " + rid}, token=tk)
        self.assertEqual(st, 409)
        st, j, _, _ = req(s, "POST", "/api/upload/plan", {"run_id": rid}, token=tk)
        self.assertEqual(st, 409)
        self.assertEqual(len(puts()) - p0, len(pl["objects"]))
        ov = req(s, "GET", "/api/overview")[1]
        self.assertEqual(ov["last_upload"]["run"], rid); self.assertEqual(ov["counts"]["UPLOADED_VERIFIED"], 1)

    def test_12_double_submit_single_upload(self):
        s = self.main; tk = token(s); rid = self.R[1]
        pl = req(s, "POST", "/api/upload/plan", {"run_id": rid}, token=tk)[1]
        p0 = len(puts()); res = []
        body = {"run_id": rid, "plan_id": pl["plan_id"], "plan_hash": pl["plan_hash"], "confirm": "ENVIAR " + rid}
        th = [threading.Thread(target=lambda: res.append(req(s, "POST", "/api/upload/execute", body, token=tk)[0])) for _ in range(6)]
        [t.start() for t in th]; [t.join() for t in th]
        self.assertEqual(sorted(res), [202] + [409] * 5, res)
        self.wait_job(s)
        self.assertEqual(len(puts()) - p0, len(pl["objects"]), "PUT duplicado")

    def test_13_plan_changed_requires_new_review(self):
        s = self.main; tk = token(s); rid = self.R[2]
        pl = req(s, "POST", "/api/upload/plan", {"run_id": rid}, token=tk)[1]
        p0 = len(puts())
        r = sh([BA, "supersede", "--run", rid, "--only", "BA-02", "--reason", "teste: plano alterado"])
        self.assertEqual(r.returncode, 0, r.stdout)
        st, j, _, _ = req(s, "POST", "/api/upload/execute", {"run_id": rid, "plan_id": pl["plan_id"], "plan_hash": pl["plan_hash"], "confirm": "ENVIAR " + rid}, token=tk)
        self.assertEqual(st, 409); self.assertTrue(j.get("needs_new_review")); self.assertIn("mudou", j["error"])
        self.assertEqual(len(puts()), p0)
        # novo plano revisado funciona
        pl2 = req(s, "POST", "/api/upload/plan", {"run_id": rid}, token=tk)[1]
        self.assertNotEqual(pl2["plan_hash"], pl["plan_hash"]); self.assertNotIn("BA-02", [o["id"] for o in pl2["objects"]])

    def test_14_busy_blocks_second_run(self):
        # job lento em instância própria: duas operações simultâneas e o servidor parado durante o job
        slow = os.path.join(T, "slow-aws"); open(slow, "w").write('#!/usr/bin/env bash\n[ "$1 $2" = "s3api put-object" ] && sleep ${SLOW_SECS:-4}\nexec ' + os.path.join(os.environ["HERE_BA_TESTS"], "mock-aws") + ' "$@"\n'); os.chmod(slow, 0o700)
        conf = os.path.join(T, "backup-a-slow.env")
        txt = open(os.path.join(T, "backup-a.env")).read().replace("BA_AWS_BIN=", "BA_AWS_BIN=" + slow + "\n#orig=")
        open(conf, "w").write(txt)
        sv = start("slow", 18780, conf, {"SLOW_SECS": "4"}); tk = token(sv)
        self.assertEqual(req(sv, "POST", "/api/aws/session", {}, token=tk)[0], 200)
        rid = self.R[3]
        pl = req(sv, "POST", "/api/upload/plan", {"run_id": rid}, token=tk)[1]
        other = req(sv, "POST", "/api/upload/plan", {"run_id": self.R[2]}, token=tk)[1]
        p0 = len(puts())
        st, j, _, _ = req(sv, "POST", "/api/upload/execute", {"run_id": rid, "plan_id": pl["plan_id"], "plan_hash": pl["plan_hash"], "confirm": "ENVIAR " + rid}, token=tk)
        self.assertEqual(st, 202)
        st, j2, _, _ = req(sv, "POST", "/api/upload/execute", {"run_id": self.R[2], "plan_id": other["plan_id"], "plan_hash": other["plan_hash"], "confirm": "ENVIAR " + self.R[2]}, token=tk)
        self.assertEqual(st, 409); self.assertIn("em andamento", j2["error"])      # nunca dois uploads simultâneos
        # "fechar a página" = nenhuma conexão; parar o servidor NÃO mata o upload
        time.sleep(0.5); stop("slow")
        sv2 = start("slow2", 18781, conf, {"SLOW_SECS": "4"}, state=sv["state"])
        job = req(sv2, "GET", "/api/job")[1]["job"]
        self.assertIn(job["status"], ("running_untracked", "indeterminate"), job)
        end = time.time() + 60
        while time.time() < end and not open(os.path.join(T, "auto", "queue", rid, "STATE")).read().strip() == "UPLOADED_VERIFIED":
            time.sleep(0.5)
        self.assertEqual(open(os.path.join(T, "auto", "queue", rid, "STATE")).read().strip(), "UPLOADED_VERIFIED")
        n = len(puts()) - p0
        self.assertEqual(n, len(pl["objects"]), "o job deve ter terminado uma única vez")
        time.sleep(1)
        job = req(sv2, "GET", "/api/job")[1]["job"]
        self.assertEqual(job["status"], "indeterminate")           # sem código de saída capturado ⇒ indeterminado até reconciliar
        self.assertTrue(job["exit_code"] is None)
        stop("slow2")

    def test_15_expired_session_blocks(self):
        sv = start("exp", 18790, os.path.join(T, "backup-a.env"), {"MOCK_MODE": "expired"}); tk = token(sv)
        st, j, _, _ = req(sv, "POST", "/api/aws/session", {}, token=tk)
        self.assertEqual(st, 200); self.assertFalse(j["all_ok"]); self.assertTrue(all(v["status"] == "EXPIRADA" for v in j["profiles"].values()), j)
        rid = self.R[2]
        pl = req(sv, "POST", "/api/upload/plan", {"run_id": rid, "remote_check": True}, token=tk)[1]
        self.assertFalse(pl["remote_check"]["done"])
        p0 = len(puts())
        st, j, _, _ = req(sv, "POST", "/api/upload/execute", {"run_id": rid, "plan_id": pl["plan_id"], "plan_hash": pl["plan_hash"], "confirm": "ENVIAR " + rid}, token=tk)
        self.assertEqual(st, 409); self.assertEqual(len(puts()), p0)
        stop("exp")

    def test_16_ambiguous_shows_reconcile_path(self):
        # run com PutObject ambíguo vira "AMBÍGUO" e NÃO é reenviado pelo dashboard
        rid = self.R[2]
        sdir = os.path.join(T, "auto", "queue", rid, "state"); os.makedirs(sdir, exist_ok=True)
        open(os.path.join(sdir, "BA-01-git-core.put-attempt"), "w").write("x")
        d = req(self.main, "GET", "/api/run/" + rid)[1]
        self.assertIn("AMBÍGUO", d["upload_state"]); self.assertTrue(d["ambiguous"])
        os.remove(os.path.join(sdir, "BA-01-git-core.put-attempt"))

    def test_16b_reconcile_guards(self):
        s = self.main; tk = token(s)
        self.assertEqual(req(s, "POST", "/api/upload/reconcile", {}, token=tk)[0], 400)
        sv = start("fresh", 18795, os.path.join(T, "backup-a.env")); t2 = token(sv)
        self.assertEqual(req(sv, "POST", "/api/upload/reconcile", {"confirm": "CONCILIAR"}, token=t2)[0], 409)   # sem sessão verificada
        stop("fresh")

    def test_16c_source_failure_is_unavailable_not_zero(self):
        conf = os.path.join(T, "backup-a-bad.env")
        open(conf, "w").write(open(os.path.join(T, "backup-a.env")).read() + "\nBA_SPACE_PATH=/nao-existe-xyz\n")
        sv = start("bad", 18796, conf)
        ov = req(sv, "GET", "/api/overview")[1]
        self.assertIsNone(ov["disk"]["c_drive"]); self.assertFalse(ov["source_status"]["disk_c_drive"]["ok"]); self.assertTrue(ov["source_status"]["disk_c_drive"]["error"])
        self.assertIsNotNone(ov["disk"]["queue_fs"])
        stop("bad")

    def test_17_static_safety(self):
        js = open(os.path.join(DASH, "static", "app.js")).read()
        for bad in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "localStorage", "sessionStorage"):
            self.assertNotIn(bad, js, bad)
        html = open(os.path.join(DASH, "static", "index.html")).read() + open(os.path.join(DASH, "static", "app.css")).read()
        self.assertNotRegex(html, r"https?://")                    # sem CDN/fontes externas
        self.assertNotIn("<script>", html)
        srv = open(SERVER).read()
        self.assertNotIn("0.0.0.0", srv)
        self.assertIn('ThreadingHTTPServer(("127.0.0.1", port)', srv)
        self.assertNotIn("shell=True", srv)
        for forbidden in ("prune-local", "capture", "restore", "decrypt", "prune"):
            self.assertNotRegex(srv, r'\[SCRIPT, *["\']%s' % forbidden)          # o servidor só chama upload --plan/--run e reconcile
        self.assertEqual(sorted(set(re.findall(r'\[SCRIPT, *"([a-z\-]+)"', srv))), ["upload"])
        self.assertEqual(sh(["grep", "-c", "access-control", SERVER]).stdout.strip(), "0")

    def test_18_real_aws_never_called(self):
        self.assertFalse(os.path.exists(os.path.join(T, "real-aws-calls.log")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
