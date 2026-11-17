"""Inspect one corrected image stopped, then reuse existing isolated smokes.

Only the owned container is modified/removed. No host dist/node_modules mounts.
Run from the repository; --syntax-only checks harness syntax without Docker.
"""
import argparse
import hashlib
import io
import json
import posixpath
import re
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]
REL = HERE.relative_to(REPO).as_posix()
RECORD = HERE / "corrected-image-validation.json"
CORE_IMPORT = re.compile(
    r"""(?:\bfrom\s*|\bimport\s*)["'](@eiah/core(?:/[^"']*)?)["']"""
)
RELATIVE_IMPORT = re.compile(
    r"""(?:\bfrom\s*|\bimport\s*)["'](\.[^"']+\.js)["']"""
)
IMAGE_ID = "sha256:f1828dc119705930e8b9ef16edf7592948a4e394a64aad1edec0f0624c47f720"

CONTROLLER = r"""
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
assert.equal(process.cwd(), "/app/apps/api");
const executions = [];
for (const name of ["image-registry-check.mjs", "image-consumer-check.mjs"]) {
  const bootstrap = "globalThis.resolveFromApi = specifier => import.meta.resolve(specifier); await import(" +
    JSON.stringify(pathToFileURL(here + "/" + name).href) + ");";
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", bootstrap], {
    cwd: "/app/apps/api", env: { PATH: process.env.PATH, NODE_ENV: "test", LOG_PRETTY: "false" },
    encoding: "utf8", timeout: 45000
  });
  executions.push({ name, exitCode: child.status, signal: child.signal,
    stdout: child.stdout, stderr: child.stderr, errorCode: child.error?.code });
  if (child.status !== 0) {
    writeFileSync(here + "/image-runtime-results.json", JSON.stringify({executions, result:"REPROVADO"}, null, 2));
    console.log(JSON.stringify({result:"REPROVADO", harness:name, exitCode:child.status, errorCode:child.error?.code}));
    process.exit(1);
  }
}
const registry = JSON.parse(readFileSync(here + "/correction-results.json", "utf8"));
const consumers = JSON.parse(readFileSync(here + "/consumer-packaging-results.json", "utf8"));
assert.equal(registry.checks.passed, 5);
assert.equal(consumers.checks.passed, 7);
assert.equal(registry.blockedNetworkAttempts, 0);
assert.equal(consumers.blockedNetworkAttempts, 0);
const result = {result:"APROVADO", executions, registry, consumers,
  scope:"Actual compiled modules in image; exact emitted executor excerpt in VM with synthetic constructors. No full API boot."};
writeFileSync(here + "/image-runtime-results.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify({result:result.result, registry:registry.checks, consumers:consumers.checks,
  registryCalls:registry.syntheticAdapterCalls, blockedNetworkAttempts:0, realProviderCalls:0}));
"""


def digest(data):
    return hashlib.sha256(data).hexdigest()


def replace_one(source, old, new):
    assert source.count(old) == 1, "Harness adaptation anchor must match exactly once: " + old[:90]
    return source.replace(old, new, 1)


def prepare_payload():
    """Adapt only host-only prerequisites/metadata; preserve executor bytes."""
    support = {
        name: (REPO / name).read_text()
        for name in [
            "apps/api/src/orchestrator/llmExecutor.ts",
            "apps/api/Dockerfile.prod",
            ".dockerignore",
        ]
    }
    original_registry = (HERE / "check.mjs").read_text()
    registry = replace_one(
        original_registry,
        'const read = (path) => readFileSync(resolve(root, path), "utf8");',
        "const imageSupport = " + json.dumps(support, ensure_ascii=True) + ";\n"
        'const read = path => existsSync(resolve(root,path)) ? readFileSync(resolve(root,path),"utf8") : '
        'Object.hasOwn(imageSupport,path) ? imageSupport[path] : (()=>{throw new Error("Missing image artifact: "+path);})();',
    )
    start = registry.index('const protectedFiles = ["CLAUDE.md", "CODEX.md",')
    end = registry.index("];", start) + 2
    registry = registry[:start] + "const protectedFiles = [];" + registry[end:]
    registry = replace_one(
        registry,
        'relative(root, resolve(here, "results.json"))])].map(path =>',
        'relative(root, resolve(here, "results.json"))])].filter(path => existsSync(resolve(root,path))).map(path =>',
    )
    registry = replace_one(registry, "imageBuilt: false, deployedArtifactInspected: false,",
                           "imageBuilt: true, deployedArtifactInspected: false,")
    registry = replace_one(registry, "buildsExecuted: 2, sourceOrConfigEdits: 1,",
                           "buildsExecuted: 0, sourceOrConfigEdits: 0,")
    original_consumers = (HERE / "consumer-packaging-check.mjs").read_text()
    consumers = replace_one(
        original_consumers,
        "const manifests = manifestPaths.map(path => {",
        "const manifests = manifestPaths.filter(path => existsSync(resolve(root,path))).map(path => {",
    )
    consumers = replace_one(
        consumers,
        "correction-results.json (5/5; all 43 hashes checked, no repetition)",
        "correction-results.json (5/5 in this image; image artifact hashes checked)",
    )
    consumers = replace_one(
        consumers, "DB, queue, Docker image or staging proof.",
        "DB, queue, full API execution or staging proof.",
    )
    payload = {
        REL + "/check.mjs": original_registry.encode(),
        REL + "/consumer-packaging-check.mjs": original_consumers.encode(),
        REL + "/results.json": (HERE / "results.json").read_bytes(),
        REL + "/image-registry-check.mjs": registry.encode(),
        REL + "/image-consumer-check.mjs": consumers.encode(),
        REL + "/image-controller.mjs": CONTROLLER.encode(),
        (HERE.parent.parent / "package-smoke.mjs").relative_to(REPO).as_posix():
            (HERE.parent.parent / "package-smoke.mjs").read_bytes(),
    }
    return payload


def syntax_checks(payload):
    # Parser-only checks: no application imports or host smoke execution.
    for name, data in payload.items():
        if name.endswith(("image-registry-check.mjs", "image-consumer-check.mjs", "image-controller.mjs")):
            p = subprocess.run(["node", "--check", "--input-type=module"], input=data, capture_output=True)
            assert p.returncode == 0, name + ": " + p.stderr.decode()


def execute(image):
    assert image == IMAGE_ID, "This evidence harness is scoped to the recorded corrected image ID."
    payload = prepare_payload()
    syntax_checks(payload)
    record = json.loads(RECORD.read_text())
    assert record["image"]["id"] == image
    attempt = {
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "imageId": image, "result": "EM_EXECUCAO",
        "commands": [], "container": None, "inspection": {}, "execution": {},
        "harnessPreparation": {
            "sourceFiles": ["check.mjs", "consumer-packaging-check.mjs", "../../package-smoke.mjs"],
            "payloadSha256": {name: digest(data) for name, data in payload.items()},
            "syntaxOnlyExitCode": 0,
            "adaptations": [
                "Expected API source and Docker recipe snapshots are comparison fixtures only; no host executable artifact is imported.",
                "Protected host-file checks omitted in container; existing host integrity proof is separate.",
                "Only image-existing files enter registry artifact hash dictionary.",
                "CLI/worker manifests absent from API delivery omitted.",
                "Image-specific build/coverage metadata corrected; executor excerpt unchanged.",
            ],
        },
    }
    record.setdefault("imageValidationResumptions", []).append(attempt)
    cid = None
    phase = "create_stopped_container"

    def checkpoint():
        RECORD.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")

    def run(args, data=None, check=True, timeout=120):
        p = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
        item = {"argv": args, "exitCode": p.returncode}
        attempt["commands"].append(item)
        if check and p.returncode:
            item["stderr"] = p.stderr.decode(errors="replace")[:2000]
            checkpoint()
            raise RuntimeError("Command failed in phase " + phase + " (exit " + str(p.returncode) + ")")
        return p

    files = {}

    def copy_tar(path, content=True, optional=False):
        p = run(["docker", "cp", cid + ":" + path, "-"], check=not optional)
        if p.returncode:
            return None
        members = []
        with tarfile.open(fileobj=io.BytesIO(p.stdout), mode="r:") as tar:
            for m in tar:
                full = posixpath.normpath(posixpath.join(posixpath.dirname(path), m.name))
                assert full == path or full.startswith(path + "/"), full
                item = {"path": full, "size": m.size,
                        "kind": "file" if m.isfile() else "symlink" if m.issym() else "directory"}
                if m.issym():
                    item["linkname"] = m.linkname
                if m.isfile() and content:
                    value = tar.extractfile(m).read()
                    files[full] = value
                    item["sha256"] = digest(value)
                members.append(item)
        return members

    try:
        p = run(["docker", "create", "--network", "none", "--entrypoint", "node",
                 "--workdir", "/app/apps/api", image, "--input-type=module", "-e",
                 "globalThis.resolveFromApi = specifier => import.meta.resolve(specifier); await import(" +
                 json.dumps("file:///app/" + REL + "/image-controller.mjs") + ");"])
        cid = p.stdout.decode().strip()
        assert re.fullmatch(r"[0-9a-f]{64}", cid)
        attempt["container"] = cid
        checkpoint()
        print(json.dumps({"phase": phase, "container": cid, "started": False}), flush=True)
        phase = "stopped_filesystem_inspection"
        state = run(["docker", "inspect", "--format",
                     "{{.State.Running}} {{.HostConfig.NetworkMode}} {{json .Mounts}}", cid]).stdout.decode().strip()
        assert state == "false none []", state
        attempt["inspection"]["initialState"] = state
        paths = [
            "/app/packages/core/dist", "/app/packages/core/package.json", "/app/packages/core/tsup.config.ts",
            "/app/apps/api/dist", "/app/apps/api/package.json", "/app/packages/providers/dist",
            "/app/packages/providers/package.json", "/app/apps/api/node_modules/@eiah/core",
            "/app/apps/api/node_modules/@repo/db", "/app/node_modules/.bin/prisma",
            "/app/packages/db/prisma.config.ts", "/app/packages/db/prisma/schema.prisma",
        ]
        records = {}
        attempt["inspection"]["paths"] = records
        for path in paths:
            records[path] = copy_tar(path)
        records["/app/packages/db/prisma/migrations"] = copy_tar("/app/packages/db/prisma/migrations", False)
        assert re.search(rb"splitting:\s*true", files["/app/packages/core/tsup.config.ts"])
        manifest = json.loads(files["/app/packages/core/package.json"])
        specs = set()
        for name, data in files.items():
            if name == "/app/apps/api/dist/index.js" or name.startswith("/app/packages/providers/dist/") and name.endswith(".js"):
                specs.update(CORE_IMPORT.findall(data.decode()))
        assert len(specs) > 0

        def entry(spec):
            key = "." if spec == "@eiah/core" else "." + spec[len("@eiah/core"):]
            value = manifest["exports"].get(key)
            match = None
            if value is None:
                for pattern, candidate in manifest["exports"].items():
                    if "*" not in pattern:
                        continue
                    left, right = pattern.split("*")
                    if key.startswith(left) and key.endswith(right):
                        value = candidate
                        match = key[len(left):len(key)-len(right) if right else None]
                        break
            if isinstance(value, dict):
                value = value.get("import", value.get("default"))
            assert isinstance(value, str), spec
            if match is not None:
                value = value.replace("*", match)
            return posixpath.normpath("/app/packages/core/" + value)

        entries = {spec: entry(spec) for spec in sorted(specs)}
        seen, edges = set(), set()

        def visit(name):
            if name in seen:
                return
            assert name in files, "Missing compiled module " + name
            seen.add(name)
            for imp in RELATIVE_IMPORT.findall(files[name].decode()):
                to = posixpath.normpath(posixpath.join(posixpath.dirname(name), imp))
                assert to.startswith("/app/packages/core/dist/")
                edges.add((name, imp, to))
                visit(to)

        for name in entries.values():
            visit(name)
        allocations = {n: len(re.findall(rb"new LLMRegistry\(\)", files[n]))
                       for n in seen if b"new LLMRegistry()" in files[n]}
        assert sum(allocations.values()) == 1
        attempt["inspection"].update({
            "result": "APROVADO", "splittingTrue": True, "entries": entries,
            "modules": sorted(seen), "chunks": sorted(n for n in seen if "/chunk-" in n),
            "edges": [{"from": a, "specifier": b, "to": c} for a, b, c in sorted(edges)],
            "registryAllocations": allocations,
            "scope": "Stopped container reads; static JS import/from clauses and manifest exports, no module execution.",
        })
        checkpoint()
        print(json.dumps({"phase": phase, "result": "APROVADO",
                          "entries": len(entries), "modules": len(seen), "edges": len(edges)}), flush=True)
        phase = "make_existing_harness_available"
        availability = {}
        for name in ["check.mjs", "consumer-packaging-check.mjs"]:
            path = "/app/" + REL + "/" + name
            available = copy_tar(path, optional=True) is not None
            availability[name] = {"presentInOriginalImage": available}
            assert not available, "Refuse to overwrite a preexisting harness in the image."
        attempt["harnessPreparation"]["availability"] = availability
        # Whitelisted scripts/history only, copied into this stopped container's layer.
        # No source/dist/module tree mount and no credential/config file volume.
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w") as tar:
            for name, data in payload.items():
                info = tarfile.TarInfo(name)
                info.size, info.mode = len(data), 0o644
                tar.addfile(info, io.BytesIO(data))
        run(["docker", "cp", "-", cid + ":/app"], buffer.getvalue())
        for name, expected in payload.items():
            path = "/app/" + name
            copy_tar(path)
            assert digest(files[path]) == digest(expected), "Harness copy differs: " + name
        for item in availability.values():
            item["availableInStoppedContainerAfterCopy"] = True
        checkpoint()
        phase = "isolated_image_smoke"
        p = run(["docker", "start", "--attach", cid], check=False)
        attempt["execution"].update({"attachExitCode": p.returncode,
                                    "stdout": p.stdout.decode(errors="replace"),
                                    "stderr": p.stderr.decode(errors="replace")})
        final_state = run(["docker", "inspect", "--format",
                          "{{.State.Running}} {{.State.ExitCode}} {{.HostConfig.NetworkMode}} {{json .Mounts}}",
                          cid]).stdout.decode().strip()
        attempt["execution"]["finalState"] = final_state
        output_path = "/app/" + REL + "/image-runtime-results.json"
        if copy_tar(output_path, optional=True) is not None:
            attempt["execution"]["results"] = json.loads(files[output_path])
        checkpoint()
        assert p.returncode == 0 and final_state == "false 0 none []", "Image harness failed."
        assert attempt["execution"]["results"]["result"] == "APROVADO"
        attempt["result"] = "APROVADO_RECORTE"
    except Exception as error:
        attempt["result"] = "REPROVADO_HARNESS_OU_INSPECAO"
        attempt["failure"] = {"phase": phase, "type": type(error).__name__, "message": str(error)[:2000]}
    finally:
        # Never remove a preexisting resource. On failure this also stops only our own harness.
        if cid:
            p = subprocess.run(["docker", "rm", "--force", cid], capture_output=True, timeout=30)
            attempt["commands"].append({"argv": ["docker", "rm", "--force", cid], "exitCode": p.returncode})
            attempt["cleanup"] = {"ownedContainer": cid, "removeExitCode": p.returncode,
                                  "removed": p.returncode == 0}
            if p.returncode:
                attempt["cleanup"]["stderr"] = p.stderr.decode(errors="replace")[:1000]
                attempt["result"] = "PARCIAL_LIMPEZA_PENDENTE"
        attempt["finishedAt"] = datetime.now(timezone.utc).isoformat()
        checkpoint()
    print(json.dumps({"result": attempt["result"], "cleanup": attempt.get("cleanup"),
                      "failure": attempt.get("failure")}), flush=True)
    return 0 if attempt["result"] == "APROVADO_RECORTE" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", default=IMAGE_ID)
    parser.add_argument("--syntax-only", action="store_true")
    args = parser.parse_args()
    if args.syntax_only:
        syntax_checks(prepare_payload())
        print("Adapter and transformed existing harnesses: syntax only approved; no Docker or smoke.")
    else:
        raise SystemExit(execute(args.image))
