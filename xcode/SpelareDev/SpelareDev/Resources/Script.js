function show(enabled, useSettingsInsteadOfPreferences) {
    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('state-on')[0].innerText = "Spelare is on. Open any YouTube video in Safari to try it.";
        document.getElementsByClassName('state-off')[0].innerText = "Spelare is off right now. You can flip it on under Safari > Settings > Extensions.";
        document.getElementsByClassName('state-unknown')[0].innerText = "Spelare runs inside Safari. Switch it on under Safari > Settings > Extensions.";
        document.getElementsByClassName('open-preferences')[0].innerText = "Close this and open Safari Settings…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
