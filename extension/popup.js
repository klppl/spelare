document.addEventListener('DOMContentLoaded', () => {

    // Checkboxes for parts of YouTube to hide; each is off unless set.
    let hideSettings = ['hideShorts', 'hideRecommendations', 'hideComments', 'hideEndScreens'];
    let settings = ['autoplay', 'resumePlayback', 'evenLoudness', 'quality', 'showToolbar', 'showCaption', 'subtitles', ...hideSettings];
    browser.storage.sync.get(settings).then((results) => {
        let autoplay = typeof(results.autoplay) === 'undefined' ? false : results.autoplay;
        // Values older versions offered: 4320p never worked (it played Auto),
        // and YouTube's code for Japanese is ja, not jp.
        let quality = results.quality === 'highres' ? 'auto' : results.quality || 'auto';
        let showToolbar = typeof(results.showToolbar) === 'undefined' ? true : results.showToolbar;
        let showCaption = typeof(results.showCaption) === 'undefined' ? false : results.showCaption;
        let subtitles = results.subtitles === 'jp' ? 'ja' : results.subtitles || 'system';

        document.querySelector('#autoplay').checked = autoplay;
        document.querySelector('#evenLoudness').checked = results.evenLoudness !== false;
        document.querySelector('#resumePlayback').checked = results.resumePlayback !== false;
        document.querySelector('#quality').value = quality;
        document.querySelector('#quality').dispatchEvent(new Event('change'));
        document.querySelector('#showToolbar').checked = showToolbar;
        document.querySelector('#showCaption').checked = showCaption;
        document.querySelector('#subtitles').value = subtitles;
        document.querySelector('#subtitles').dispatchEvent(new Event('change'));
        for (let name of hideSettings) document.querySelector(`#${name}`).checked = results[name] === true;
    });

    for (let name of hideSettings) {
        let checkbox = document.querySelector(`#${name}`);
        checkbox.addEventListener('change', () => {
            browser.storage.sync.set({ [name]: checkbox.checked });
        });
    }

    let autoplay = document.querySelector('#autoplay');
    autoplay.addEventListener('change', () => {
        browser.storage.sync.set({ autoplay: autoplay.checked });
    });

    let resumePlayback = document.querySelector('#resumePlayback');
    resumePlayback.addEventListener('change', () => {
        browser.storage.sync.set({ resumePlayback: resumePlayback.checked });
    });

    let evenLoudness = document.querySelector('#evenLoudness');
    evenLoudness.addEventListener('change', () => {
        browser.storage.sync.set({ evenLoudness: evenLoudness.checked });
    });

    let quality = document.querySelector('#quality');
    quality.addEventListener('change', (event) => {
        browser.storage.sync.set({ quality: quality.value });
        // A quality the user picks (not the one shown on opening) also
        // switches the video in the tab the popup is over.
        if (!event.isTrusted) return;
        browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
            if (tab) return browser.tabs.sendMessage(tab.id, { type: 'apply-quality', quality: quality.value });
        }).catch(() => {});
    });

    let showToolbar = document.querySelector('#showToolbar');
    showToolbar.addEventListener('change', () => {
        browser.storage.sync.set({ showToolbar: showToolbar.checked });
    });

    let showCaption = document.querySelector('#showCaption');
    showCaption.addEventListener('change', () => {
        browser.storage.sync.set({ showCaption: showCaption.checked });
    });

    let subtitles = document.querySelector('#subtitles');
    subtitles.addEventListener('change', () => {
        browser.storage.sync.set({ subtitles: subtitles.value });
    });

    let showButton = document.querySelector('#showDebugInfo');
    showButton.addEventListener('click', () => {
        // background.js keeps a log per tab; show the one this popup is over.
        browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
            return browser.runtime.sendMessage({ type: 'get-logs', tabId: tab?.id });
        }).then((results) => {
            // Log text includes page-controlled strings, so it must not be parsed as HTML.
            let output = document.createElement('pre');
            output.textContent = results.logs.length > 0
                ? results.logs.join('\n')
                : 'Nothing logged in this tab yet. Open a YouTube video here, then look again.';
            document.body.replaceChildren(output);
        });
    });

});
