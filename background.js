// AddBar — Service Worker (background.js)

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-addbar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;
      openPopup(tab);
    });
  }
});

function openPopup(tab) {
  chrome.windows.getCurrent((currentWindow) => {
    const width = 620;
    const height = 500;
    const left = Math.round(currentWindow.left + (currentWindow.width - width) / 2);
    const top = currentWindow.top + 80;

    chrome.windows.create({
      url: 'popup.html?tabId=' + tab.id + '&windowId=' + currentWindow.id,
      type: 'popup',
      width,
      height,
      left,
      top,
    });
  });
}
