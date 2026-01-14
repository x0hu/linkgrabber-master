const DEFAULT_SETTINGS = {
  blockedDomains: ['bad1.example.com', 'bad2.example.com', 'bad4.example.com'],
};

const DEFAULT_SESSION = {
  tabData: {},
};

// Track pending frame collections per tab
const pendingCollections = new Map();

function warnLastError() {
  if (chrome.runtime.lastError) {
    console.warn(chrome.runtime.lastError); // eslint-disable-line
  }
}

// Aggregate links from all frames and open results
function finalizeCollection(tabId) {
  const collection = pendingCollections.get(tabId);
  if (!collection) return;

  clearTimeout(collection.timeout);
  pendingCollections.delete(tabId);

  // Dedupe links across frames
  const seenUrls = new Set();
  const allLinks = [];
  collection.links.forEach(link => {
    const dedupKey = link.href.replace(/^https?:\/\//, '');
    if (!seenUrls.has(dedupKey)) {
      seenUrls.add(dedupKey);
      allLinks.push(link);
    }
  });

  chrome.storage.session.get(DEFAULT_SESSION).then(session => {
    session.tabData[tabId] = {
      source: collection.sourceUrl,
      links: allLinks,
    };
    return chrome.storage.session.set(session);
  }).then(() => {
    chrome.tabs.create({
      index: collection.tabIndex + 1,
      openerTabId: tabId,
      url: chrome.runtime.getURL('html/links.html') + '?tab_id=' + String(tabId),
    });
  });
}

// Start collection for a tab - count frames and set timeout
async function startCollection(tab) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
  const frameCount = frames ? frames.length : 1;

  pendingCollections.set(tab.id, {
    expectedFrames: frameCount,
    receivedFrames: 0,
    links: [],
    sourceUrl: tab.url,
    tabIndex: tab.index,
    timeout: setTimeout(() => finalizeCollection(tab.id), 3000), // 3s timeout
  });

  chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: ['js/contentscript.js'],
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(DEFAULT_SETTINGS, options => {
    chrome.storage.sync.set(options);
  });
  chrome.contextMenus.create({
    id: 'Link Grabber',
    title: 'Link Grabber',
    contexts: ['page'],
    documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*'],
  }, warnLastError);
});

chrome.action.onClicked.addListener((tab) => {
  startCollection(tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  startCollection(tab);
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // Clean up pending collection if exists
  const collection = pendingCollections.get(tabId);
  if (collection) {
    clearTimeout(collection.timeout);
    pendingCollections.delete(tabId);
  }

  chrome.storage.session.get(DEFAULT_SESSION).then(session => {
    delete session.tabData[tabId];
    chrome.storage.session.set(session);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'links-found') {
    const tabId = sender.tab.id;
    const collection = pendingCollections.get(tabId);

    if (collection) {
      // Add links from this frame
      collection.links.push(...msg.links);
      collection.receivedFrames++;

      // Check if all frames responded
      if (collection.receivedFrames >= collection.expectedFrames) {
        finalizeCollection(tabId);
      }
    }
    return;
  }
});