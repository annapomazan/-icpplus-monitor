"""
monitor.py
==========

ICPPLUS appointment monitor for GitHub Actions.

Runs ONCE per execution (the GitHub Actions cron schedule calls this
repeatedly). For each client profile in data/profiles.json, it:

  1. Drives a headless Chrome browser through the ICPPLUS "Cita Previa
     Extranjeria" flow for Barcelona (province -> sin certificado ->
     procedure -> calendar).
  2. Decides whether appointment slots seem to be available.
  3. If available, sends an email with a direct link and updates
     data/status.json so the dashboard (GitHub Pages) shows an alert.

It does NOT solve CAPTCHAs and does NOT submit any booking form - that part
is always done manually by you, quickly, after the alert.
"""

import json
import os
import random
import smtplib
import sys
import time
from datetime import datetime, timezone
from email.mime.text import MIMEText

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException


BASE_URL = "https://sede.administracionespublicas.gob.es/icpplus/index.html"

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
PROFILES_FILE = os.path.join(DATA_DIR, "profiles.json")
STATUS_FILE = os.path.join(DATA_DIR, "status.json")

# Default selectors - the real ICPPLUS site varies slightly by province and
# changes over time. Override per-profile via "selectors" in profiles.json
# if a step gets stuck (see README).
DEFAULT_SELECTORS = {
    "cookie_accept_xpath": "//button[contains(text(),'Aceptar')]",
    "province_select_id": "form",
    "province_submit_id": "btnAceptar",
    "no_cert_link_xpath": "//a[contains(text(),'sin certificado')]",
    "tramite_select_id": "tramiteGrupo[0]",
    "tramite_submit_id": "btnEntrar",
    "intermediate_continue_xpaths": ["//input[@id='btnEntrar']"],
    "calendar_indicator_id": "calendario",
}

DEFAULT_NO_SLOTS_PHRASES = [
    "no hay citas disponibles",
    "no existen citas disponibles",
    "en este momento no hay citas disponibles",
    "no hay horas disponibles",
]

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = os.environ.get("GMAIL_EMAIL", "")        # e.g. realtoreelshorts@gmail.com
SMTP_PASS = os.environ.get("GMAIL_APP_PASSWORD", "")  # 16-char app password
ALERT_TO = os.environ.get("ALERT_EMAIL_TO", "") or SMTP_USER


def human_delay(a: float = 0.4, b: float = 1.0) -> None:
    time.sleep(random.uniform(a, b))


def build_driver() -> webdriver.Chrome:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1280,900")
    options.add_argument("--lang=es-ES")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(60)
    return driver


def wait_and_click(driver, by, value, timeout=20):
    elem = WebDriverWait(driver, timeout).until(EC.element_to_be_clickable((by, value)))
    elem.click()
    return elem


def wait_for(driver, by, value, timeout=20):
    return WebDriverWait(driver, timeout).until(EC.presence_of_element_located((by, value)))


def check_appointments(driver, profile: dict, log) -> tuple[bool, str]:
    """
    Run through the booking flow for a single profile and return
    (slots_available, current_url).
    """
    sel = {**DEFAULT_SELECTORS, **(profile.get("selectors") or {})}
    no_slots_phrases = profile.get("no_slots_phrases") or DEFAULT_NO_SLOTS_PHRASES

    log("Opening ICPPLUS home page...")
    driver.get(BASE_URL)
    human_delay(2, 4)

    # Cookie banner (optional)
    try:
        wait_and_click(driver, By.XPATH, sel["cookie_accept_xpath"], timeout=5)
        human_delay()
    except TimeoutException:
        pass

    log(f"Selecting province '{profile['province']}'...")
    province_select = Select(wait_for(driver, By.ID, sel["province_select_id"]))
    province_select.select_by_visible_text(profile["province"])
    human_delay()
    wait_and_click(driver, By.ID, sel["province_submit_id"])
    human_delay(2, 4)

    log("Choosing 'sin certificado digital'...")
    wait_and_click(driver, By.XPATH, sel["no_cert_link_xpath"])
    human_delay(2, 4)

    log(f"Selecting procedure '{profile['procedure_name']}'...")
    tramite_select = Select(wait_for(driver, By.ID, sel["tramite_select_id"]))
    tramite_select.select_by_visible_text(profile["procedure_name"])
    human_delay()
    wait_and_click(driver, By.ID, sel["tramite_submit_id"])
    human_delay(2, 4)

    for xpath in sel.get("intermediate_continue_xpaths", []):
        try:
            wait_and_click(driver, By.XPATH, xpath, timeout=8)
            human_delay(1, 2)
        except TimeoutException:
            continue

    page_text = driver.page_source.lower()
    for phrase in no_slots_phrases:
        if phrase.lower() in page_text:
            log(f"No-slots message found ('{phrase}').")
            return False, driver.current_url

    try:
        wait_for(driver, By.ID, sel["calendar_indicator_id"], timeout=8)
        log("Calendar/slot-selection element found - slots may be available!")
        return True, driver.current_url
    except TimeoutException:
        log("No calendar element found either - assuming no slots.")
        return False, driver.current_url


def send_email(subject: str, body: str) -> None:
    if not SMTP_USER or not SMTP_PASS or not ALERT_TO:
        print("Email not configured - skipping notification.")
        return
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = SMTP_USER
        msg["To"] = ALERT_TO

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, [ALERT_TO], msg.as_string())
    except Exception as e:
        print(f"Email send error: {e}")


def load_profiles() -> list:
    with open(PROFILES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def load_status() -> dict:
    if not os.path.exists(STATUS_FILE):
        return {"profiles": {}, "last_run": None}
    with open(STATUS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_status(status: dict) -> None:
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        json.dump(status, f, indent=2, ensure_ascii=False)


def run_profile(profile: dict) -> dict:
    """Run one check cycle for one profile, return its status dict."""
    logs = []

    def log(msg):
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        line = f"[{ts}] {msg}"
        logs.append(line)
        print(f"[{profile['name']}] {line}")

    driver = None
    try:
        driver = build_driver()
        available, url = check_appointments(driver, profile, log)
        return {
            "name": profile["name"],
            "province": profile["province"],
            "procedure_name": profile["procedure_name"],
            "status": "available" if available else "unavailable",
            "url": url,
            "last_check": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "logs": logs[-15:],
        }
    except WebDriverException as e:
        log(f"Browser/WebDriver error: {e}")
        return {
            "name": profile["name"],
            "province": profile["province"],
            "procedure_name": profile["procedure_name"],
            "status": "error",
            "url": None,
            "last_check": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "logs": logs[-15:],
        }
    except Exception as e:
        log(f"Unexpected error: {e}")
        return {
            "name": profile["name"],
            "province": profile["province"],
            "procedure_name": profile["procedure_name"],
            "status": "error",
            "url": None,
            "last_check": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "logs": logs[-15:],
        }
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass


def main():
    profiles = load_profiles()
    status = load_status()
    status.setdefault("profiles", {})

    if not profiles:
        print("No profiles configured in data/profiles.json - nothing to do.")
        status["last_run"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        save_status(status)
        return

    any_available = False

    for profile in profiles:
        if not profile.get("enabled", True):
            print(f"Skipping disabled profile: {profile['name']}")
            continue

        print(f"=== Checking profile: {profile['name']} ===")
        result = run_profile(profile)
        status["profiles"][profile["id"]] = result

        if result["status"] == "available":
            any_available = True
            subject = f"🔔 ICPPLUS slot may be available: {result['name']}"
            body = (
                f"SLOT MAY BE AVAILABLE\n\n"
                f"Client: {result['name']}\n"
                f"Province: {result['province']}\n"
                f"Procedure: {result['procedure_name']}\n\n"
                f"Link: {result['url']}\n\n"
                f"Open this link, redo province/procedure selection if "
                f"needed, use Autofill (Tampermonkey), solve CAPTCHA + SMS, "
                f"and submit FAST - slots disappear in seconds!"
            )
            send_email(subject, body)

        # Small pause between profiles to avoid hammering the site back-to-back
        human_delay(1.5, 3)

    status["last_run"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    save_status(status)

    if any_available:
        print("\n*** AT LEAST ONE PROFILE HAS POSSIBLE SLOTS ***")
    else:
        print("\nNo slots found in this run.")


if __name__ == "__main__":
    main()
