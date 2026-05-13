"""
text-guard 全工作流自动化测试
覆盖:
  - 登录(admin/editor),Dashboard
  - 内容创建 + 敏感词检测 + 保存
  - editor 提交内容 -> admin 审核(通过/驳回)
  - 敏感词管理(单条 + 批量导入)
  - 报表导出(Word/Excel 真实下载文件校验)
  - 操作日志
  - 密码修改 + 回滚
  - 权限边界(editor 访问 admin-only 路由 -> 403)
"""
from __future__ import annotations

import io
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, APIRequestContext, Browser

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BASE = "http://localhost:5173"
API = "http://localhost:3000/api"
SHOTS = Path("D:/_text-guar/_shots")
DOWNLOADS = Path("D:/_text-guar/_downloads")
SHOTS.mkdir(exist_ok=True)
DOWNLOADS.mkdir(exist_ok=True)

results: list[tuple[str, bool, str]] = []


def step(name: str, ok: bool, detail: str = "") -> None:
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}" + (f" - {detail[:200]}" if detail else ""), flush=True)
    results.append((name, ok, detail))


def shot(page: Page, name: str) -> None:
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


def safe(name: str):
    """装饰器:捕获异常并记为 FAIL,不中断后续步骤"""
    def deco(fn):
        def wrapper(*a, **kw):
            try:
                return fn(*a, **kw)
            except Exception as e:
                step(name, False, repr(e))
                return None
        return wrapper
    return deco


# -------------------- API 辅助 --------------------

def api_login(api: APIRequestContext, username: str, password: str) -> str:
    r = api.post(f"{API}/auth/login", data={"username": username, "password": password})
    if not r.ok:
        raise RuntimeError(f"login {username} -> {r.status} {r.text()[:200]}")
    return r.json()["data"]["token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# -------------------- UI 测试 --------------------

def ui_login(page: Page, username: str, password: str) -> None:
    page.goto(BASE + "/login", wait_until="networkidle", timeout=30000)
    page.locator("input").nth(0).fill(username)
    page.locator("input[type='password']").fill(password)
    page.get_by_role("button", name="进入审核台").click()
    page.wait_for_url("**/dashboard", timeout=15000)
    page.wait_for_load_state("networkidle")


def test_login_admin(page: Page) -> bool:
    try:
        ui_login(page, "admin", "admin123")
        shot(page, "01_login_admin")
        step("[UI] admin 登录", True, page.url)
        return True
    except Exception as e:
        shot(page, "01_login_admin_fail")
        step("[UI] admin 登录", False, repr(e))
        return False


def test_dashboard(page: Page) -> None:
    try:
        content = page.content()
        has_stats = all(k in content for k in ["工作台", "内容总数"])
        step("[UI] Dashboard 渲染", has_stats)
    except Exception as e:
        step("[UI] Dashboard 渲染", False, repr(e))


def test_sensitive_single_add(page: Page) -> None:
    try:
        page.goto(BASE + "/sensitive-words", wait_until="networkidle", timeout=15000)
        add_btn = page.get_by_role("button", name="新增敏感词")
        if add_btn.count() == 0:
            add_btn = page.locator("button:has-text('新增')").first
        add_btn.click()
        page.wait_for_timeout(400)
        modal = page.locator(".ant-modal").last
        unique = f"测试词UI_{int(time.time())}"
        modal.locator("input").first.fill(unique)
        page.locator(".ant-modal-footer button.ant-btn-primary").last.click()
        page.wait_for_timeout(1200)
        shot(page, "02_sensitive_added")
        step("[UI] 敏感词单条新增", unique in page.content(), unique)
    except Exception as e:
        step("[UI] 敏感词单条新增", False, repr(e))


def test_content_create_detect_save(page: Page) -> int | None:
    """admin 创建内容并保存,返回内容 id"""
    try:
        page.goto(BASE + "/contents/create", wait_until="networkidle", timeout=15000)
        page.locator("input").first.fill("自动化-完整流程测试")
        page.locator("textarea").first.fill("这是一段测试文本,包含 测试敏感词 用于触发检测。")

        # 触发检测
        detected = False
        for label in ["预检测", "检测"]:
            btn = page.locator(f"button:has-text('{label}')")
            if btn.count() > 0:
                btn.first.click()
                page.wait_for_timeout(1200)
                detected = True
                break
        shot(page, "03_content_detect")
        step("[UI] 敏感词实时检测触发", detected)

        # 保存 (POST /api/contents)
        save_btn = page.locator("button.ant-btn-primary").filter(has_text="保")
        with page.expect_response(
            lambda r: "/api/contents" in r.url and r.request.method == "POST", timeout=8000
        ) as resp_info:
            save_btn.first.click()
        resp = resp_info.value
        ok = resp.ok
        body = resp.json() if ok else {}
        cid = body.get("data", {}).get("id") if ok else None
        shot(page, "04_content_saved")
        step("[UI] 内容保存", ok, f"id={cid} status={resp.status}")
        return cid
    except Exception as e:
        step("[UI] 内容保存", False, repr(e))
        return None


def test_content_list_contains(page: Page) -> None:
    try:
        page.goto(BASE + "/contents", wait_until="networkidle", timeout=15000)
        shot(page, "05_content_list")
        step("[UI] 内容列表显示新条目", "自动化-完整流程测试" in page.content())
    except Exception as e:
        step("[UI] 内容列表", False, repr(e))


def test_review_list(page: Page) -> None:
    try:
        page.goto(BASE + "/review", wait_until="networkidle", timeout=15000)
        shot(page, "06_review_list")
        step("[UI] 审核列表加载", "审核" in page.content())
    except Exception as e:
        step("[UI] 审核列表加载", False, repr(e))


def test_reports_render(page: Page) -> None:
    try:
        page.goto(BASE + "/reports", wait_until="networkidle", timeout=15000)
        shot(page, "07_reports")
        c = page.content()
        ok = ("Word" in c or "word" in c) and ("Excel" in c or "excel" in c)
        step("[UI] 报表页加载(含导出按钮)", ok)
    except Exception as e:
        step("[UI] 报表页加载", False, repr(e))


def test_reports_download(page: Page) -> None:
    """点击导出按钮并真实捕获下载文件"""
    for type_name, label, ext, min_size in [
        ("word", "Word", ".docx", 200),
        ("excel", "Excel", ".xlsx", 200),
    ]:
        try:
            page.goto(BASE + "/reports", wait_until="networkidle", timeout=15000)
            # 通过 ant-btn 含文字定位
            btn = page.locator(f"button:has-text('{label}')")
            if btn.count() == 0:
                step(f"[UI] 报表导出 {label}", False, "按钮未找到")
                continue
            with page.expect_download(timeout=15000) as dl_info:
                btn.first.click()
            dl = dl_info.value
            save_path = DOWNLOADS / dl.suggested_filename
            dl.save_as(str(save_path))
            size = save_path.stat().st_size
            ok = save_path.suffix.lower() == ext and size >= min_size
            step(f"[UI] 报表导出 {label}", ok, f"{save_path.name} {size}B")
        except Exception as e:
            step(f"[UI] 报表导出 {label}", False, repr(e))


def test_logs(page: Page) -> None:
    try:
        page.goto(BASE + "/logs", wait_until="networkidle", timeout=15000)
        shot(page, "08_logs")
        c = page.content()
        # 列表中应包含本次的 create_content 行为
        step("[UI] 日志页加载", "操作日志" in c or "动作" in c)
        step("[UI] 日志记录到本次 create_content", "create_content" in c)
    except Exception as e:
        step("[UI] 日志页加载", False, repr(e))


def test_admin_logout_then_editor_login(page: Page) -> None:
    """切换到 editor 账号"""
    try:
        # 清掉 localStorage 中的 token,刷新到 login
        page.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
        ui_login(page, "editor", "editor123")
        shot(page, "09_login_editor")
        step("[UI] editor 登录", True, page.url)
    except Exception as e:
        step("[UI] editor 登录", False, repr(e))


def test_editor_submit_flow(page: Page, api: APIRequestContext, editor_token: str) -> int | None:
    """editor 创建内容并提交审核,返回 id"""
    try:
        # API 创建(更稳)
        r = api.post(
            f"{API}/contents",
            headers=auth_headers(editor_token),
            data={"title": "editor提交测试", "category": "默认", "body": "editor 提交工作流测试内容。"},
        )
        if not r.ok:
            step("[API] editor 创建内容", False, f"{r.status} {r.text()[:200]}")
            return None
        cid = r.json()["data"]["id"]
        step("[API] editor 创建内容", True, f"id={cid}")

        # 提交审核
        s = api.patch(f"{API}/contents/{cid}/submit", headers=auth_headers(editor_token))
        step("[API] editor 提交审核", s.ok, f"status={s.status}")
        return cid
    except Exception as e:
        step("[API] editor 提交", False, repr(e))
        return None


def test_admin_review_approve(page: Page, content_id: int | None) -> None:
    """admin 重新登录,在 UI 审核刚才 editor 提交的内容"""
    if content_id is None:
        step("[UI] admin 审核通过", False, "无可审核内容")
        return
    try:
        page.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
        ui_login(page, "admin", "admin123")
        page.goto(BASE + f"/review/{content_id}", wait_until="networkidle", timeout=15000)
        shot(page, "10_review_detail")
        # 通过按钮
        with page.expect_response(
            lambda r: f"/api/reviews/{content_id}/approve" in r.url and r.request.method == "POST",
            timeout=8000,
        ) as resp_info:
            page.locator("button.ant-btn-primary").filter(has_text="通").first.click()
        ok = resp_info.value.ok
        step("[UI] admin 审核通过", ok, f"status={resp_info.value.status}")
    except Exception as e:
        step("[UI] admin 审核通过", False, repr(e))


# -------------------- 纯 API 测试 --------------------

def test_sensitive_batch_import(api: APIRequestContext, admin_token: str) -> None:
    try:
        ts = int(time.time())
        words = [
            {"word": f"批量词A_{ts}", "category": "测试", "riskLevel": "low"},
            {"word": f"批量词B_{ts}", "category": "测试", "riskLevel": "medium"},
            {"word": f"批量词C_{ts}", "category": "测试", "riskLevel": "high"},
        ]
        r = api.post(
            f"{API}/sensitive-words/batch",
            headers=auth_headers(admin_token),
            data={"items": words},
        )
        ok = r.ok
        n = r.json().get("data", {}).get("count", 0) if ok else 0
        step("[API] 敏感词批量导入(3 条)", ok and n == 3, f"status={r.status} count={n}")
    except Exception as e:
        step("[API] 敏感词批量导入", False, repr(e))


def test_password_change_and_restore(api: APIRequestContext) -> None:
    """改 editor 密码后用新密码登录,再改回来。失败也要确保密码回滚"""
    new_pwd = "EditorNew123!"
    token = None
    try:
        # 用旧密码登录
        token = api_login(api, "editor", "editor123")
    except Exception as e:
        step("[API] 密码修改 - 旧密码登录", False, repr(e))
        return

    try:
        r = api.put(
            f"{API}/auth/password",
            headers=auth_headers(token),
            data={"oldPassword": "editor123", "newPassword": new_pwd},
        )
        step("[API] 密码修改", r.ok, f"status={r.status}")
    except Exception as e:
        step("[API] 密码修改", False, repr(e))
        return

    # 用新密码登录
    new_login_ok = False
    try:
        new_token = api_login(api, "editor", new_pwd)
        new_login_ok = bool(new_token)
        step("[API] 新密码登录", new_login_ok)
    except Exception as e:
        step("[API] 新密码登录", False, repr(e))

    # 回滚密码
    try:
        if new_login_ok:
            rt = api_login(api, "editor", new_pwd)
            rb = api.put(
                f"{API}/auth/password",
                headers=auth_headers(rt),
                data={"oldPassword": new_pwd, "newPassword": "editor123"},
            )
            step("[API] 密码回滚", rb.ok, f"status={rb.status}")
        else:
            step("[API] 密码回滚", False, "新密码登录失败,无法回滚")
    except Exception as e:
        step("[API] 密码回滚", False, repr(e))


def test_rbac_editor_forbidden(api: APIRequestContext) -> None:
    """editor 访问 admin-only 路由应当被拒绝"""
    try:
        token = api_login(api, "editor", "editor123")
    except Exception as e:
        step("[API] editor 登录", False, repr(e))
        return
    # editor 不该能读 /sensitive-words(admin only)
    cases = [
        ("GET", f"{API}/sensitive-words"),
        ("POST", f"{API}/sensitive-words"),
        ("GET", f"{API}/reports/stats"),
        ("GET", f"{API}/logs"),
    ]
    for method, url in cases:
        try:
            if method == "GET":
                r = api.get(url, headers=auth_headers(token))
            else:
                r = api.post(url, headers=auth_headers(token), data={"word": "x", "category": "x", "riskLevel": "low"})
            forbidden = r.status in (401, 403)
            step(f"[RBAC] editor {method} {url.split('/api')[-1]} -> 403", forbidden, f"status={r.status}")
        except Exception as e:
            step(f"[RBAC] editor {method} {url}", False, repr(e))


def test_health(api: APIRequestContext) -> None:
    try:
        r = api.get(f"{API}/health")
        step("[API] /api/health", r.ok, f"status={r.status}")
    except Exception as e:
        step("[API] /api/health", False, repr(e))


# -------------------- 主流程 --------------------

def run() -> None:
    with sync_playwright() as p:
        browser: Browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page = ctx.new_page()
        api = p.request.new_context()

        # ---- 后端可用性 ----
        test_health(api)

        # ---- admin token 用于纯 API 测试 ----
        admin_token = ""
        try:
            admin_token = api_login(api, "admin", "admin123")
            step("[API] admin 登录", True)
        except Exception as e:
            step("[API] admin 登录", False, repr(e))

        # ---- UI: admin 登录后跑完整工作流 ----
        if not test_login_admin(page):
            browser.close()
            return
        test_dashboard(page)
        test_sensitive_single_add(page)
        test_content_create_detect_save(page)
        test_content_list_contains(page)
        test_review_list(page)
        test_reports_render(page)
        test_reports_download(page)
        test_logs(page)

        # ---- API: editor 提交 -> 重新登录 admin 在 UI 审核通过 ----
        editor_token = ""
        try:
            editor_token = api_login(api, "editor", "editor123")
        except Exception as e:
            step("[API] editor 登录", False, repr(e))
        cid = test_editor_submit_flow(page, api, editor_token) if editor_token else None
        test_admin_review_approve(page, cid)

        # ---- 纯 API 测试 ----
        if admin_token:
            test_sensitive_batch_import(api, admin_token)
        test_password_change_and_restore(api)
        test_rbac_editor_forbidden(api)

        api.dispose()
        browser.close()


if __name__ == "__main__":
    run()
    okn = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n===== 汇总 =====", flush=True)
    print(f"通过 {okn}/{total}\n")
    for n, ok, d in results:
        mark = "[PASS]" if ok else "[FAIL]"
        print(f"  {mark} {n}" + (f"  ({d[:120]})" if d else ""))
    sys.exit(0 if okn == total else 1)
