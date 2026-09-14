// ==UserScript==
// @name         ICPPLUS Autofill Helper (multi-profile)
// @namespace    icpplus-autofill-helper
// @version      2.0
// @description  Autofills your personal details on the ICPPLUS appointment form for one of several saved profiles. Does NOT submit the form, solve CAPTCHAs, or handle SMS verification.
// @match        https://sede.administracionespublicas.gob.es/icpplus/*
// @match        https://icp.administracionelectronica.gob.es/icpplus/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'icpplus_profiles';

    // -------------------------------------------------------------------
    // 1. Default profiles - edit these once. Add one entry per person you
    //    monitor appointments for (e.g. yourself, partner, children).
    //    The "label" should match the profile "Name" you used in the
    //    web dashboard, so you know which one to pick.
    // -------------------------------------------------------------------
    const defaultProfiles = [
        {
            label: "Me",
            name: "Jane",
            surname: "Doe",
            nieOrDni: "X1234567Y",
            birthDay: "01",
            birthMonth: "01",
            birthYear: "1990",
            phone: "600000000",
            email: "jane@example.com",
            country: "ESPAÑA"
        }
        // Add more profiles here, e.g.:
        // {
        //   label: "Partner",
        //   name: "John",
        //   surname: "Smith",
        //   nieOrDni: "Y7654321Z",
        //   birthDay: "15",
        //   birthMonth: "06",
        //   birthYear: "1988",
        //   phone: "611111111",
        //   email: "john@example.com",
        //   country: "ESPAÑA"
        // },
    ];

    // Initialise localStorage with defaults on first run, without
    // overwriting any profiles the user has already customised.
    if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProfiles));
    }

    function getProfiles() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return Array.isArray(parsed) && parsed.length ? parsed : defaultProfiles;
        } catch (e) {
            console.warn('[ICPPLUS Autofill] Could not parse stored profiles, using defaults.', e);
            return defaultProfiles;
        }
    }

    function saveProfiles(profiles) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    }

    // -------------------------------------------------------------------
    // 2. Helpers to set form field values and fire the events the page's
    //    own JavaScript expects (so validation / formatting still works).
    // -------------------------------------------------------------------
    function setValue(selector, value) {
        if (value === undefined || value === null) return;
        const el = document.querySelector(selector);
        if (!el) {
            console.debug('[ICPPLUS Autofill] Field not found:', selector);
            return;
        }
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setSelectByText(selector, visibleText) {
        const el = document.querySelector(selector);
        if (!el) return;
        for (const opt of el.options) {
            if (opt.text.trim().toUpperCase() === String(visibleText).trim().toUpperCase()) {
                el.value = opt.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
        }
    }

    // -------------------------------------------------------------------
    // 3. The actual autofill logic for the currently-selected profile.
    //
    //    IMPORTANT: The selectors below (#txtNombrePasaporte, etc.) are
    //    EXAMPLES based on the typical ICPPLUS personal-data page. The
    //    real field IDs can vary depending on the procedure/province and
    //    may change when the site is updated. To find the correct ones:
    //      1. Right-click the field on the real form -> "Inspect".
    //      2. Note the "id" or "name" attribute of the <input>/<select>.
    //      3. Replace the selector strings below accordingly.
    // -------------------------------------------------------------------
    function autofill(profile) {
        if (!profile) return;

        setValue('#txtNombrePasaporte', profile.name);
        setValue('#txtApellidoPasaporte', profile.surname);
        setValue('#txtIdCitado', profile.nieOrDni);

        setValue('#txtDiaNacimientoPasaporte', profile.birthDay);
        setValue('#txtMesNacimientoPasaporte', profile.birthMonth);
        setValue('#txtAnioNacimientoPasaporte', profile.birthYear);

        setValue('#txtTelefonoCitado', profile.phone);
        setValue('#txtEmail1', profile.email);
        setValue('#txtEmail2', profile.email);

        setSelectByText('#txtPaisNac', profile.country);

        console.log(`[ICPPLUS Autofill] Filled form for profile "${profile.label}". ` +
            'Please review every field, solve the CAPTCHA, complete the SMS ' +
            'verification, and submit manually.');

        showToast(`Form autofilled for "${profile.label}" - please review before submitting!`);
    }

    function resetForm() {
        const form = document.querySelector('form');
        if (form) {
            form.reset();
            console.log('[ICPPLUS Autofill] Form fields reset.');
            showToast('Form fields reset.');
        }
    }

    // -------------------------------------------------------------------
    // 4. Small floating UI: profile picker + Autofill / Reset / Edit
    //    profiles buttons, plus a toast message for confirmation.
    // -------------------------------------------------------------------
    function showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '10px';
        toast.style.background = '#333';
        toast.style.color = '#fff';
        toast.style.padding = '8px 14px';
        toast.style.borderRadius = '6px';
        toast.style.fontSize = '13px';
        toast.style.zIndex = 1000000;
        toast.style.opacity = '0.95';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function openEditor() {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = 1000001;
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';

        const box = document.createElement('div');
        box.style.background = '#1e293b';
        box.style.color = '#e2e8f0';
        box.style.padding = '16px';
        box.style.borderRadius = '8px';
        box.style.width = '480px';
        box.style.maxWidth = '92vw';
        box.style.fontFamily = 'Arial, sans-serif';

        const title = document.createElement('div');
        title.textContent = 'Edit ICPPLUS Autofill profiles (JSON)';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '8px';

        const textarea = document.createElement('textarea');
        textarea.value = JSON.stringify(getProfiles(), null, 2);
        textarea.style.width = '100%';
        textarea.style.height = '300px';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '12px';
        textarea.style.background = '#0b1220';
        textarea.style.color = '#e2e8f0';
        textarea.style.border = '1px solid #334155';
        textarea.style.borderRadius = '6px';
        textarea.style.padding = '8px';

        const hint = document.createElement('div');
        hint.textContent = 'Each profile needs: label, name, surname, nieOrDni, birthDay, birthMonth, birthYear, phone, email, country.';
        hint.style.fontSize = '11px';
        hint.style.color = '#94a3b8';
        hint.style.margin = '6px 0 10px';

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.justifyContent = 'flex-end';
        btnRow.style.gap = '8px';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => overlay.remove();

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.onclick = () => {
            try {
                const parsed = JSON.parse(textarea.value);
                if (!Array.isArray(parsed) || !parsed.length) {
                    throw new Error('Must be a non-empty JSON array of profiles.');
                }
                saveProfiles(parsed);
                overlay.remove();
                rebuildProfileDropdown();
                showToast('Profiles saved.');
            } catch (e) {
                alert('Invalid JSON: ' + e.message);
            }
        };

        for (const b of [cancelBtn, saveBtn]) {
            b.style.padding = '6px 12px';
            b.style.borderRadius = '6px';
            b.style.border = 'none';
            b.style.cursor = 'pointer';
            b.style.fontSize = '13px';
        }
        cancelBtn.style.background = '#334155';
        cancelBtn.style.color = '#e2e8f0';
        saveBtn.style.background = '#3b82f6';
        saveBtn.style.color = '#fff';

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(saveBtn);

        box.appendChild(title);
        box.appendChild(textarea);
        box.appendChild(hint);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    function styleButton(btn) {
        btn.style.padding = '8px 12px';
        btn.style.background = '#2d6cdf';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '6px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '13px';
        btn.style.fontFamily = 'Arial, sans-serif';
        btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        btn.style.width = '100%';
    }

    let profileSelect;

    function rebuildProfileDropdown() {
        const profiles = getProfiles();
        profileSelect.innerHTML = '';
        for (const profile of profiles) {
            const opt = document.createElement('option');
            opt.value = profile.label;
            opt.textContent = profile.label;
            profileSelect.appendChild(opt);
        }
    }

    function init() {
        const panel = document.createElement('div');
        panel.style.position = 'fixed';
        panel.style.top = '10px';
        panel.style.right = '10px';
        panel.style.zIndex = 999999;
        panel.style.background = '#1e293b';
        panel.style.border = '1px solid #334155';
        panel.style.borderRadius = '8px';
        panel.style.padding = '10px';
        panel.style.width = '180px';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.gap = '6px';
        panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';

        const label = document.createElement('div');
        label.textContent = 'ICPPLUS Autofill';
        label.style.color = '#e2e8f0';
        label.style.fontFamily = 'Arial, sans-serif';
        label.style.fontSize = '12px';
        label.style.fontWeight = 'bold';
        label.style.marginBottom = '2px';

        profileSelect = document.createElement('select');
        profileSelect.style.width = '100%';
        profileSelect.style.padding = '4px';
        profileSelect.style.borderRadius = '4px';
        profileSelect.style.fontSize = '12px';

        const fillBtn = document.createElement('button');
        fillBtn.textContent = '⚡ Autofill';
        styleButton(fillBtn);
        fillBtn.onclick = () => {
            const profiles = getProfiles();
            const profile = profiles.find(p => p.label === profileSelect.value) || profiles[0];
            autofill(profile);
        };

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '↺ Reset form';
        styleButton(resetBtn);
        resetBtn.style.background = '#475569';
        resetBtn.onclick = resetForm;

        const editBtn = document.createElement('button');
        editBtn.textContent = '✎ Edit profiles';
        styleButton(editBtn);
        editBtn.style.background = '#334155';
        editBtn.onclick = openEditor;

        panel.appendChild(label);
        panel.appendChild(profileSelect);
        panel.appendChild(fillBtn);
        panel.appendChild(resetBtn);
        panel.appendChild(editBtn);
        document.body.appendChild(panel);

        rebuildProfileDropdown();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }
})();
