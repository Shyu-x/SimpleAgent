import sys
from playwright.sync_api import sync_playwright

FRONTEND_URL = "http://localhost:3001"
ADMIN_URL = "http://localhost:3001/admin"
T = 30000

class UITest:
    def __init__(self): self.r={"t":0,"p":0,"f":0}
    def log(self,n,ok,e=None):
        self.r["t"]+=1
        if ok: self.r["p"]+=1; s="[PASS]"
        else: self.r["f"]+=1; s="[FAIL]"
        print(f"{s} {n}")
        if e: print(f"       Error: {e}")

    def t1_page_loads(self,pg):
        try:
            r=pg.goto(FRONTEND_URL,timeout=T,wait_until="domcontentloaded")
            assert r and r.status<400
            pg.wait_for_load_state("networkidle",timeout=T)
            print(f"       title={pg.title()!r}")
            assert len(pg.content())>500
            self.log("[1] Page loads successfully",True)
        except Exception as e: self.log("[1] Page loads successfully",False,e)

    def t2_chat_input(self,pg):
        try:
            pg.goto(FRONTEND_URL,timeout=T,wait_until="domcontentloaded")
            pg.wait_for_load_state("networkidle",timeout=T)
            pg.wait_for_timeout(2000)
            found=False
            for sel in ["textarea","input[type=text]","[class*=input]","[class*=Input]"]:
                els=pg.locator(sel)
                if els.count()>0 and els.first.is_visible():
                    print(f"       input: {sel!r}"); found=True; break
            assert found
            self.log("[2] Chat input visible",True)
        except Exception as e: self.log("[2] Chat input visible",False,e)

    def t3_sidebar(self,pg):
        try:
            pg.goto(FRONTEND_URL,timeout=T,wait_until="domcontentloaded")
            pg.wait_for_load_state("networkidle",timeout=T)
            pg.wait_for_timeout(2000)
            found=False
            for sel in ["aside","nav","[class*=sidebar]","[class*=Sidebar]","[class*=Conversation]"]:
                els=pg.locator(sel); cnt=els.count()
                if cnt and sum(1 for i in range(cnt) if els.nth(i).is_visible()):
                    print(f"       sidebar: {sel!r}"); found=True; break
            assert found
            self.log("[3] Sidebar visible",True)
        except Exception as e: self.log("[3] Sidebar visible",False,e)

    def t4_admin(self,pg):
        try:
            r=pg.goto(ADMIN_URL,timeout=T,wait_until="domcontentloaded")
            assert r and r.status<400
            pg.wait_for_load_state("networkidle",timeout=T)
            pg.wait_for_timeout(2000)
            assert len(pg.content())>500
            for sel in ["[class*=admin]","[class*=Admin]","[class*=Dashboard]"]:
                if pg.locator(sel).count():
                    print(f"       admin: {sel!r}"); break
            self.log("[4] Admin panel accessible",True)
        except Exception as e: self.log("[4] Admin panel accessible",False,e)

    def t5_no_errors(self,pg):
        errs=[]
        def on_con(m):
            if m.type=="error":
                t=m.text
                if not any(x.lower() in t.lower() for x in ["favicon","net::ERR","Failed to fetch","HITL","SSE","ERR_CONNECTION"]):
                    errs.append(t)
        pg.on("console",on_con); pg.on("pageerror",lambda e: errs.append(str(e)))
        try:
            pg.goto(FRONTEND_URL,timeout=T,wait_until="domcontentloaded")
            pg.wait_for_load_state("networkidle",timeout=T)
            pg.wait_for_timeout(3000)
            if errs: [print(f"       ERR:{e[:100]}") for e in errs[:5]]; self.log("[5] No console errors",False,f"{len(errs)} errors")
            else: self.log("[5] No console errors",True)
        except Exception as e: self.log("[5] No console errors",False,e)

    def run(self):
        sep="="*60
        print(sep); print("Frontend UI Validation Tests"); print(f"Target: {FRONTEND_URL}"); print(sep)
        with sync_playwright() as pw:
            b=pw.chromium.launch(headless=True)
            ctx=b.new_context(viewport={"width":1280,"height":800})
            pg=ctx.new_page()
            self.t1_page_loads(pg); self.t2_chat_input(pg); self.t3_sidebar(pg)
            self.t4_admin(pg); self.t5_no_errors(pg)
            ctx.close(); b.close()
        r=self.r
        print(); print(sep)
        print(f"Results: {r[chr(112)]}/{r[chr(116)]} passed")
        if r[chr(102)]: print(f"         {r[chr(102)]} FAILED")
        print(sep)
        return r[chr(102)]==0

if __name__=="__main__":
    t=UITest(); sys.exit(0 if t.run() else 1)
