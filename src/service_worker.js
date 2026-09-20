import {getLinkIdentity} from './linkIdentity';

const DEFAULT_SETTINGS = {
  blockedDomains: ['bad1.example.com', 'bad2.example.com', 'bad4.example.com'],
};

const DEFAULT_SESSION = {
  tabData: {},
};

// Longer than the content script's bounded JavaScript scan, including its final fetch batch.
const COLLECTION_TIMEOUT_MS = 30000;

// Track pending frame collections per tab
const pendingCollections = new Map();

function warnLastError() {
  if (chrome.runtime.lastError) {
    console.warn(chrome.runtime.lastError); // eslint-disable-line
  }
}

// Aggregate links from all frames and open results
function finalizeCollection(tabId, scanId) {
  const collection = pendingCollections.get(tabId);
  if (!collection || collection.scanId !== scanId) return;

  clearTimeout(collection.timeout);
  pendingCollections.delete(tabId);

  // Dedupe links across frames
  const seenUrls = new Set();
  const allLinks = [];
  collection.links.forEach(link => {
    const dedupKey = getLinkIdentity(link);
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

// Each injection is tied to a scan and document. A failed or navigated frame
// must not make the other frames wait for the fallback timeout.
async function startCollection(tab) {
  const previous = pendingCollections.get(tab.id);
  if (previous) clearTimeout(previous.timeout);
  const scanId = crypto.randomUUID();
  const collection = {
    scanId, pendingFrames: new Set(), links: [],
    sourceUrl: tab.url, tabIndex: tab.index,
    timeout: setTimeout(() => finalizeCollection(tab.id, scanId), COLLECTION_TIMEOUT_MS),
  };
  pendingCollections.set(tab.id, collection);
  let frames;
  try {
    frames = await chrome.webNavigation.getAllFrames({tabId: tab.id});
  } catch (error) {
    frames = null;
  }
  if (pendingCollections.get(tab.id) !== collection) return;
  frames = frames?.length ? frames : [{frameId: 0}];
  frames.forEach(frame => collection.pendingFrames.add(frame.frameId));
  await Promise.all(frames.map(async frame => {
    try {
      const results = await chrome.scripting.executeScript({
        target: {tabId: tab.id, frameIds: [frame.frameId]},
        files: ['js/contentscript.js'],
      });
      if (pendingCollections.get(tab.id) !== collection) return;
      if (!results?.length) throw new Error('Frame unavailable');
      const documentId = results[0].documentId;
      const scans = await chrome.scripting.executeScript({
        target: documentId ? {tabId: tab.id, documentIds: [documentId]} : {tabId: tab.id, frameIds: [frame.frameId]},
        func: () => window.__linkGrabberScan(),
      });
      if (pendingCollections.get(tab.id) !== collection) return;
      for (const scan of scans || []) {
        if (Array.isArray(scan.result)) collection.links.push(...scan.result);
      }
      collection.pendingFrames.delete(frame.frameId);
      if (!collection.pendingFrames.size) finalizeCollection(tab.id, scanId);
    } catch (error) {
      collection.pendingFrames.delete(frame.frameId);
      if (!collection.pendingFrames.size) finalizeCollection(tab.id, scanId);
    }
  }));
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
