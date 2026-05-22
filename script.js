const STORAGE_KEYS = {
  saved: "promptfoundry-saved",
};

const LOCAL_APP_ORIGIN = "http://127.0.0.1:4173";
const API_BASE = window.location.protocol === "file:" ? LOCAL_APP_ORIGIN : "";

const state = {
  search: "",
  category: "All",
  sort: "trending",
  activePromptId: null,
  remixSourceId: null,
  prompts: [],
  resources: [],
  savedIds: new Set(loadStoredArray(STORAGE_KEYS.saved)),
  tracks: [],
  isLoading: true,
  serverError: null,
};

const elements = {
  browseCta: document.querySelector("#browse-cta"),
  categoryStrip: document.querySelector("#category-strip"),
  clearRemix: document.querySelector("#clear-remix"),
  communityPulse: document.querySelector("#community-pulse"),
  detailContent: document.querySelector("#detail-content"),
  emptyState: document.querySelector("#empty-state"),
  form: document.querySelector("#prompt-form"),
  formNote: document.querySelector("#form-note"),
  formRemix: document.querySelector("#form-remix"),
  heroFeatured: document.querySelector("#hero-featured"),
  heroNote: document.querySelector("#hero-note"),
  heroStats: document.querySelector("#hero-stats"),
  learningPaths: document.querySelector("#learning-paths"),
  learnSummary: document.querySelector("#learn-summary"),
  modelSuggestions: document.querySelector("#model-suggestions"),
  categorySuggestions: document.querySelector("#category-suggestions"),
  promptList: document.querySelector("#prompt-list"),
  resetForm: document.querySelector("#reset-form"),
  resultsCount: document.querySelector("#results-count"),
  resultsLabel: document.querySelector("#results-label"),
  resourceLibrary: document.querySelector("#resource-library"),
  resourcesCount: document.querySelector("#resources-count"),
  searchInput: document.querySelector("#search-input"),
  sortSelect: document.querySelector("#sort-select"),
  submitCta: document.querySelector("#submit-cta"),
  submitSection: document.querySelector("#submit"),
  exploreSection: document.querySelector("#explore"),
  toast: document.querySelector("#toast"),
  tracksCount: document.querySelector("#tracks-count"),
};

const formFields = {
  title: document.querySelector("#prompt-title"),
  author: document.querySelector("#prompt-author"),
  model: document.querySelector("#prompt-model"),
  category: document.querySelector("#prompt-category"),
  tags: document.querySelector("#prompt-tags"),
  summary: document.querySelector("#prompt-summary"),
  body: document.querySelector("#prompt-body"),
  notes: document.querySelector("#prompt-notes"),
};

function loadStoredArray(key) {
  try {
    const value = window.localStorage.getItem(key);
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveStoredArray(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

async function redirectFileModeToLocalApp() {
  if (window.location.protocol !== "file:") {
    return;
  }

  try {
    const response = await window.fetch(`${LOCAL_APP_ORIGIN}/api/health`);

    if (response.ok) {
      window.location.replace(`${LOCAL_APP_ORIGIN}/`);
    }
  } catch (error) {
    // Keep the file-based fallback alive if the backend is not running yet.
  }
}

function saveSavedIds() {
  saveStoredArray(STORAGE_KEYS.saved, [...state.savedIds]);
}

function apiUrl(pathname) {
  return `${API_BASE}${pathname}`;
}

async function fetchJson(pathname, options = {}) {
  const requestOptions = {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  };

  const response = await window.fetch(apiUrl(pathname), requestOptions);
  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || "Backend request failed.");
  }

  return payload;
}

function getAllPrompts() {
  return state.prompts;
}

function getPromptById(promptId) {
  return getAllPrompts().find((prompt) => prompt.id === promptId);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateString));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: value > 999 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function getTrendScore(prompt) {
  return prompt.stars * 2 + prompt.copies + prompt.remixes * 4;
}

function matchesSearch(prompt, searchValue) {
  if (!searchValue) {
    return true;
  }

  const haystack = [
    prompt.title,
    prompt.category,
    prompt.author,
    prompt.handle,
    prompt.model,
    prompt.summary,
    prompt.notes,
    prompt.prompt,
    prompt.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(searchValue.toLowerCase());
}

function sortPrompts(prompts) {
  const sorted = [...prompts];

  sorted.sort((left, right) => {
    if (state.sort === "newest") {
      return new Date(right.updatedAt) - new Date(left.updatedAt);
    }

    if (state.sort === "starred") {
      return right.stars - left.stars;
    }

    if (state.sort === "copied") {
      return right.copies - left.copies;
    }

    return getTrendScore(right) - getTrendScore(left);
  });

  return sorted;
}

function getFilteredPrompts() {
  const prompts = getAllPrompts().filter((prompt) => {
    const categoryMatches = state.category === "All" || prompt.category === state.category;
    return categoryMatches && matchesSearch(prompt, state.search);
  });

  return sortPrompts(prompts);
}

function getTopPrompt() {
  return sortPrompts(getAllPrompts())[0];
}

function getTopCategories() {
  const categories = new Map();

  getAllPrompts().forEach((prompt) => {
    const current = categories.get(prompt.category) || { count: 0, score: 0 };
    current.count += 1;
    current.score += getTrendScore(prompt);
    categories.set(prompt.category, current);
  });

  return [...categories.entries()]
    .sort((left, right) => right[1].score - left[1].score)
    .slice(0, 4);
}

function getTopTrack() {
  return state.tracks[0];
}

function getBeginnerResourceCount() {
  return state.resources.filter((resource) => resource.level.toLowerCase().includes("beginner")).length;
}

function getLatestSubmissions() {
  return [...state.prompts]
    .filter((prompt) => prompt.source === "community")
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
    .slice(0, 3);
}

function ensureActivePrompt(filteredPrompts) {
  const stillVisible = filteredPrompts.some((prompt) => prompt.id === state.activePromptId);

  if (stillVisible) {
    return;
  }

  state.activePromptId = filteredPrompts[0]?.id || getAllPrompts()[0]?.id || null;
}

function applyPromptUpdate(updatedPrompt) {
  state.prompts = state.prompts.map((prompt) =>
    prompt.id === updatedPrompt.id ? updatedPrompt : prompt,
  );
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2200);
}

function setHeroNote(message) {
  if (elements.heroNote) {
    elements.heroNote.textContent = message;
  }
}

function updateCommunitySuggestions() {
  const categories = [...new Set(getAllPrompts().map((prompt) => prompt.category))].sort();
  const models = [...new Set(getAllPrompts().map((prompt) => prompt.model))].sort();

  elements.categorySuggestions.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join("");

  elements.modelSuggestions.innerHTML = models
    .map((model) => `<option value="${escapeHtml(model)}"></option>`)
    .join("");
}

function renderHeroStats() {
  const allPrompts = getAllPrompts();
  const uniqueAuthors = new Set(allPrompts.map((prompt) => prompt.author)).size;
  const totalCopies = allPrompts.reduce((sum, prompt) => sum + prompt.copies, 0);
  const totalCategories = new Set(allPrompts.map((prompt) => prompt.category)).size;

  elements.heroStats.innerHTML = `
    <div class="stats-card">
      <span>Repositories</span>
      <strong>${formatNumber(allPrompts.length)}</strong>
    </div>
    <div class="stats-card">
      <span>Maintainers</span>
      <strong>${formatNumber(uniqueAuthors)}</strong>
    </div>
    <div class="stats-card">
      <span>Topics</span>
      <strong>${formatNumber(totalCategories)}</strong>
    </div>
    <div class="stats-card">
      <span>Total uses</span>
      <strong>${formatNumber(totalCopies)}</strong>
    </div>
  `;
}

function renderLearningHub() {
  if (state.isLoading) {
    elements.learnSummary.innerHTML = '<div class="detail-empty">Loading AI learning resources...</div>';
    elements.learningPaths.innerHTML = '<div class="detail-empty">Loading learning paths...</div>';
    elements.resourceLibrary.innerHTML = '<div class="detail-empty">Loading resource library...</div>';
    elements.tracksCount.textContent = "Loading...";
    elements.resourcesCount.textContent = "Loading...";
    return;
  }

  if (state.serverError) {
    const errorMarkup = `<div class="detail-empty">${escapeHtml(state.serverError)}</div>`;
    elements.learnSummary.innerHTML = errorMarkup;
    elements.learningPaths.innerHTML = errorMarkup;
    elements.resourceLibrary.innerHTML = errorMarkup;
    elements.tracksCount.textContent = "Backend offline";
    elements.resourcesCount.textContent = "Backend offline";
    return;
  }

  const featuredTrack = getTopTrack();
  const beginnerResources = getBeginnerResourceCount();

  elements.learnSummary.innerHTML = `
    <div class="learn-summary__item">
      <span>Learning paths</span>
      <strong>${formatNumber(state.tracks.length)}</strong>
    </div>
    <div class="learn-summary__item">
      <span>Guides and tools</span>
      <strong>${formatNumber(state.resources.length)}</strong>
    </div>
    <div class="learn-summary__item">
      <span>Beginner friendly</span>
      <strong>${formatNumber(beginnerResources)} resources</strong>
    </div>
    <div class="learn-summary__item">
      <span>Start here</span>
      <strong>${escapeHtml(featuredTrack?.title || "AI Fundamentals")}</strong>
    </div>
  `;

  elements.tracksCount.textContent = `${formatNumber(state.tracks.length)} paths`;
  elements.resourcesCount.textContent = `${formatNumber(state.resources.length)} resources`;

  elements.learningPaths.innerHTML = state.tracks
    .map(
      (track) => `
        <article class="track-card">
          <div class="track-card__top">
            <span class="learn-badge">${escapeHtml(track.level)}</span>
            <span class="meta-chip">${escapeHtml(track.duration)}</span>
          </div>
          <div>
            <h4>${escapeHtml(track.title)}</h4>
            <p>${escapeHtml(track.summary)}</p>
          </div>
          <div class="track-card__metrics">
            <span>${formatNumber(track.lessons)} lessons</span>
            <div class="tag-row">
              ${track.topics.map((topic) => `<span class="tag-pill">${escapeHtml(topic)}</span>`).join("")}
            </div>
          </div>
          <ul class="track-outcomes">
            ${track.outcomes.map((outcome) => `<li>${escapeHtml(outcome)}</li>`).join("")}
          </ul>
        </article>
      `,
    )
    .join("");

  elements.resourceLibrary.innerHTML = state.resources
    .map(
      (resource) => `
        <article class="resource-card">
          <div class="resource-card__top">
            <span class="learn-badge">${escapeHtml(resource.type)}</span>
            <span class="meta-chip">${escapeHtml(resource.format)}</span>
          </div>
          <div>
            <h4>${escapeHtml(resource.title)}</h4>
            <p>${escapeHtml(resource.summary)}</p>
          </div>
          <div class="resource-card__meta">
            <span>${escapeHtml(resource.level)}</span>
            <div class="tag-row">
              ${resource.topics.map((topic) => `<span class="tag-pill">${escapeHtml(topic)}</span>`).join("")}
            </div>
          </div>
          <div class="resource-card__best-for">
            <strong>Best for:</strong> ${escapeHtml(resource.bestFor)}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderFeaturedPrompt() {
  if (state.isLoading) {
    elements.heroFeatured.innerHTML = '<p class="detail-empty">Loading featured repository...</p>';
    return;
  }

  if (state.serverError) {
    elements.heroFeatured.innerHTML = `<p class="detail-empty">${escapeHtml(state.serverError)}</p>`;
    return;
  }

  const prompt = getTopPrompt();

  if (!prompt) {
    elements.heroFeatured.innerHTML = '<p class="detail-empty">No featured prompt yet.</p>';
    return;
  }

  const isSaved = state.savedIds.has(prompt.id);

  elements.heroFeatured.innerHTML = `
    <article class="featured-card">
      <div class="featured-card__top">
        <span class="category-badge">${escapeHtml(prompt.category)}</span>
        <span class="meta-chip">Updated ${escapeHtml(formatDate(prompt.updatedAt))}</span>
      </div>
      <div>
        <h3 class="featured-card__title">${escapeHtml(prompt.title)}</h3>
        <p class="featured-card__copy">${escapeHtml(prompt.summary)}</p>
      </div>
      <div class="featured-card__stats">
        <span class="stat-pill"><span>Stars</span>${formatNumber(prompt.stars)}</span>
        <span class="stat-pill"><span>Uses</span>${formatNumber(prompt.copies)}</span>
        <span class="stat-pill"><span>Forks</span>${formatNumber(prompt.remixes)}</span>
      </div>
      <p class="featured-card__meta">${escapeHtml(prompt.author)} ${escapeHtml(prompt.handle)} / ${escapeHtml(prompt.model)}</p>
      <div class="tag-row">
        ${prompt.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
      </div>
      <div class="featured-card__actions">
        <button type="button" class="prompt-card__action" data-copy-id="${escapeHtml(prompt.id)}">Use prompt</button>
        <button
          type="button"
          class="prompt-card__action ${isSaved ? "is-saved" : ""}"
          data-save-id="${escapeHtml(prompt.id)}"
        >
          ${isSaved ? "Starred" : "Star"}
        </button>
        <button type="button" class="prompt-card__action" data-remix-id="${escapeHtml(prompt.id)}">Fork</button>
      </div>
    </article>
  `;
}

function renderCategories() {
  const counts = new Map();

  getAllPrompts().forEach((prompt) => {
    counts.set(prompt.category, (counts.get(prompt.category) || 0) + 1);
  });

  const orderedCategories = [
    ["All", getAllPrompts().length],
    ...[...counts.entries()].sort((left, right) => left[0].localeCompare(right[0])),
  ];

  elements.categoryStrip.innerHTML = orderedCategories
    .map(([category, count]) => {
      const activeClass = state.category === category ? " is-active" : "";
      return `
        <button
          type="button"
          class="category-pill${activeClass}"
          data-category="${escapeHtml(category)}"
          aria-pressed="${state.category === category}"
        >
          <strong>${escapeHtml(category)}</strong>
          <span>${formatNumber(count)}</span>
        </button>
      `;
    })
    .join("");
}

function renderPromptList(filteredPrompts) {
  if (state.isLoading) {
    elements.promptList.hidden = false;
    elements.promptList.innerHTML = '<div class="detail-empty">Loading repositories from the backend...</div>';
    return;
  }

  if (state.serverError) {
    elements.promptList.hidden = false;
    elements.promptList.innerHTML = `<div class="detail-empty">${escapeHtml(state.serverError)}</div>`;
    return;
  }

  elements.promptList.innerHTML = filteredPrompts
    .map((prompt) => {
      const isSaved = state.savedIds.has(prompt.id);
      const isActive = state.activePromptId === prompt.id;

      return `
        <article class="prompt-card${isActive ? " is-active" : ""}">
          <button type="button" class="prompt-card__button" data-open-id="${escapeHtml(prompt.id)}">
            <div class="prompt-card__top">
              <span class="category-badge">${escapeHtml(prompt.category)}</span>
              <span class="meta-chip">Updated ${escapeHtml(formatDate(prompt.updatedAt))}</span>
            </div>
            <div>
              <h3 class="prompt-card__title">${escapeHtml(prompt.title)}</h3>
              <p class="prompt-card__meta">
                ${escapeHtml(prompt.author)} ${escapeHtml(prompt.handle)} / ${escapeHtml(prompt.model)}
              </p>
            </div>
            <p class="prompt-card__summary">${escapeHtml(prompt.summary)}</p>
            <div class="prompt-card__stats">
              <span class="stat-pill"><span>Stars</span>${formatNumber(prompt.stars)}</span>
              <span class="stat-pill"><span>Uses</span>${formatNumber(prompt.copies)}</span>
              <span class="stat-pill"><span>Forks</span>${formatNumber(prompt.remixes)}</span>
            </div>
            <div class="tag-row">
              ${prompt.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
            </div>
          </button>
          <div class="prompt-card__actions">
            <button type="button" class="prompt-card__action" data-copy-id="${escapeHtml(prompt.id)}">Use prompt</button>
            <button
              type="button"
              class="prompt-card__action ${isSaved ? "is-saved" : ""}"
              data-save-id="${escapeHtml(prompt.id)}"
            >
              ${isSaved ? "Starred" : "Star"}
            </button>
            <button type="button" class="prompt-card__action" data-remix-id="${escapeHtml(prompt.id)}">Fork</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderResultsSummary(filteredPrompts) {
  if (state.isLoading) {
    elements.resultsCount.textContent = "Loading...";
    elements.resultsLabel.textContent = "Connecting to the local backend and loading repositories.";
    return;
  }

  if (state.serverError) {
    elements.resultsCount.textContent = "Backend offline";
    elements.resultsLabel.textContent = state.serverError;
    return;
  }

  const promptWord = filteredPrompts.length === 1 ? "repository" : "repositories";
  const categoryCopy = state.category === "All" ? "all topics" : state.category;
  const searchCopy = state.search ? ` for "${state.search}"` : "";

  elements.resultsCount.textContent = `${formatNumber(filteredPrompts.length)} ${promptWord}`;
  elements.resultsLabel.textContent = `Showing ${promptWord} in ${categoryCopy}${searchCopy}.`;
}

function renderDetailPanel() {
  if (state.isLoading) {
    elements.detailContent.innerHTML = `
      <div class="detail-empty">
        Waiting for the backend to return repository details.
      </div>
    `;
    return;
  }

  if (state.serverError) {
    elements.detailContent.innerHTML = `
      <div class="detail-empty">
        ${escapeHtml(state.serverError)}
      </div>
    `;
    return;
  }

  const prompt = state.activePromptId ? getPromptById(state.activePromptId) : null;

  if (!prompt) {
    elements.detailContent.innerHTML = `
      <div class="detail-empty">
        Pick a prompt repository to inspect the full prompt body, notes, and community stats.
      </div>
    `;
    return;
  }

  const isSaved = state.savedIds.has(prompt.id);

  elements.detailContent.innerHTML = `
    <article class="detail-shell">
      <div class="detail-shell__top">
        <span class="category-badge">${escapeHtml(prompt.category)}</span>
        <span class="meta-chip">Updated ${escapeHtml(formatDate(prompt.updatedAt))}</span>
      </div>

      <div>
        <h3 class="detail-shell__title">${escapeHtml(prompt.title)}</h3>
        <p class="detail-shell__summary">${escapeHtml(prompt.summary)}</p>
      </div>

      <div class="detail-actions">
        <button type="button" class="prompt-card__action" data-copy-id="${escapeHtml(prompt.id)}">Use prompt</button>
        <button
          type="button"
          class="prompt-card__action ${isSaved ? "is-saved" : ""}"
          data-save-id="${escapeHtml(prompt.id)}"
        >
          ${isSaved ? "Starred" : "Star"}
        </button>
        <button type="button" class="prompt-card__action" data-remix-id="${escapeHtml(prompt.id)}">Fork into form</button>
      </div>

      <dl class="detail-meta">
        <div>
          <dt>Maintainer</dt>
          <dd>${escapeHtml(prompt.author)} ${escapeHtml(prompt.handle)}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>${escapeHtml(prompt.model)}</dd>
        </div>
        <div>
          <dt>Stars</dt>
          <dd>${formatNumber(prompt.stars)}</dd>
        </div>
        <div>
          <dt>Uses</dt>
          <dd>${formatNumber(prompt.copies)}</dd>
        </div>
      </dl>

      <div class="tag-row">
        ${prompt.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
      </div>

      <section class="detail-code">
        <h4>Prompt body</h4>
        <pre>${escapeHtml(prompt.prompt)}</pre>
      </section>

      <section class="detail-notes">
        <h4>Usage notes</h4>
        <p>${escapeHtml(prompt.notes)}</p>
      </section>
    </article>
  `;
}

function renderCommunityPulse() {
  if (state.isLoading) {
    elements.communityPulse.innerHTML = '<div class="detail-empty">Loading community data...</div>';
    return;
  }

  if (state.serverError) {
    elements.communityPulse.innerHTML = `<div class="detail-empty">${escapeHtml(state.serverError)}</div>`;
    return;
  }

  const topCategories = getTopCategories();
  const latestSubmissions = getLatestSubmissions();
  const publishedCount = state.prompts.filter((prompt) => prompt.source === "community").length;

  const summaryMarkup = `
    <div class="community-summary">
      <div class="community-summary__item">
        <span>Starred by you</span>
        <strong>${formatNumber(state.savedIds.size)}</strong>
      </div>
      <div class="community-summary__item">
        <span>Your published</span>
        <strong>${formatNumber(publishedCount)}</strong>
      </div>
      <div class="community-summary__item">
        <span>Trending topic</span>
        <strong>${escapeHtml(topCategories[0]?.[0] || "Open")}</strong>
      </div>
      <div class="community-summary__item">
        <span>Latest repo</span>
        <strong>${escapeHtml(latestSubmissions[0]?.title || "Waiting")}</strong>
      </div>
    </div>
  `;

  const categoryMarkup = topCategories
    .map(
      ([category, data]) => `
        <div class="pulse-list-item">
          <strong>${escapeHtml(category)}</strong>
          <span>${formatNumber(data.count)} repos</span>
        </div>
      `,
    )
    .join("");

  const recentMarkup =
    latestSubmissions.length > 0
      ? latestSubmissions
          .map(
            (prompt) => `
              <div class="pulse-list-item">
                <strong>${escapeHtml(prompt.title)}</strong>
                <span>${escapeHtml(formatDate(prompt.updatedAt))}</span>
              </div>
            `,
          )
          .join("")
      : `
          <div class="pulse-list-item">
            <strong>Be the first shipper</strong>
            <span>Your prompt will appear here.</span>
          </div>
        `;

  elements.communityPulse.innerHTML = `
    ${summaryMarkup}

    <div class="pulse-group">
      <h4>Top topics</h4>
      <div class="pulse-card__list">
        ${categoryMarkup}
      </div>
    </div>

    <div class="pulse-group">
      <h4>Latest repos</h4>
      <div class="pulse-card__list">
        ${recentMarkup}
      </div>
    </div>
  `;
}

function renderEmptyState(filteredPrompts) {
  const shouldShowEmpty =
    !state.isLoading && !state.serverError && filteredPrompts.length === 0;

  elements.emptyState.hidden = !shouldShowEmpty;
  elements.promptList.hidden = shouldShowEmpty;
}

function rerender() {
  const filteredPrompts = state.isLoading || state.serverError ? [] : getFilteredPrompts();
  ensureActivePrompt(filteredPrompts);
  renderHeroStats();
  renderLearningHub();
  renderFeaturedPrompt();
  renderCategories();
  renderPromptList(filteredPrompts);
  renderResultsSummary(filteredPrompts);
  renderDetailPanel();
  renderCommunityPulse();
  renderEmptyState(filteredPrompts);
  updateCommunitySuggestions();
}

async function loadAppData() {
  state.isLoading = true;
  state.serverError = null;
  rerender();

  try {
    const [promptData, resourceData] = await Promise.all([
      fetchJson("/api/prompts"),
      fetchJson("/api/resources"),
    ]);

    state.prompts = Array.isArray(promptData.prompts) ? promptData.prompts : [];
    state.resources = Array.isArray(resourceData.resources) ? resourceData.resources : [];
    state.tracks = Array.isArray(resourceData.tracks) ? resourceData.tracks : [];
    state.isLoading = false;
    state.serverError = null;
    state.activePromptId = state.activePromptId || state.prompts[0]?.id || null;
    setHeroNote("Connected to the local backend. Prompts and learning resources are syncing from localhost.");
  } catch (error) {
    state.isLoading = false;
    state.serverError = "Could not reach the local backend. Start the server on http://127.0.0.1:4173 and reload.";
    setHeroNote(state.serverError);
  }

  rerender();
}

async function copyPrompt(promptId) {
  const prompt = getPromptById(promptId);

  if (!prompt) {
    return;
  }

  try {
    await navigator.clipboard.writeText(prompt.prompt);
  } catch (error) {
    showToast("Clipboard access failed on this browser.");
    return;
  }

  try {
    const data = await fetchJson(`/api/prompts/${encodeURIComponent(promptId)}/use`, {
      method: "POST",
    });

    if (data?.prompt) {
      applyPromptUpdate(data.prompt);
    }

    rerender();
    showToast(`Copied "${prompt.title}" to your clipboard`);
  } catch (error) {
    showToast(`Copied "${prompt.title}", but the backend could not record the use.`);
  }
}

async function toggleSave(promptId) {
  const isSaved = state.savedIds.has(promptId);
  const delta = isSaved ? -1 : 1;

  try {
    const data = await fetchJson(`/api/prompts/${encodeURIComponent(promptId)}/star`, {
      body: JSON.stringify({ delta }),
      method: "POST",
    });

    if (isSaved) {
      state.savedIds.delete(promptId);
      showToast("Removed star from repository");
    } else {
      state.savedIds.add(promptId);
      showToast("Starred repository");
    }

    saveSavedIds();

    if (data?.prompt) {
      applyPromptUpdate(data.prompt);
    }

    rerender();
  } catch (error) {
    showToast("Could not update the star count on the backend.");
  }
}

function openPrompt(promptId) {
  state.activePromptId = promptId;
  renderPromptList(getFilteredPrompts());
  renderDetailPanel();
}

function startRemix(promptId) {
  const prompt = getPromptById(promptId);

  if (!prompt) {
    return;
  }

  state.remixSourceId = promptId;
  formFields.title.value = `${slugify(prompt.title)}-fork`;
  formFields.author.value = "";
  formFields.model.value = prompt.model;
  formFields.category.value = prompt.category;
  formFields.tags.value = prompt.tags.join(", ");
  formFields.summary.value = prompt.summary;
  formFields.body.value = prompt.prompt;
  formFields.notes.value = prompt.notes;
  elements.formRemix.hidden = false;
  elements.formNote.textContent = `Forking ${prompt.title}. Update the prompt and notes before publishing your version.`;
  elements.submitSection.scrollIntoView({ behavior: "smooth", block: "start" });
  formFields.title.focus();
}

function clearRemix() {
  state.remixSourceId = null;
  elements.formRemix.hidden = true;
  elements.formNote.textContent = "New repositories appear immediately in the feed and persist in the local backend.";
}

function resetFormState() {
  window.setTimeout(() => {
    clearRemix();
  }, 0);
}

async function handleFormSubmit(event) {
  event.preventDefault();

  const title = formFields.title.value.trim();
  const author = formFields.author.value.trim();
  const model = formFields.model.value.trim();
  const category = formFields.category.value.trim();
  const summary = formFields.summary.value.trim();
  const promptBody = formFields.body.value.trim();
  const notes = formFields.notes.value.trim();
  const tags = formFields.tags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (!title || !author || !model || !category || !summary || !promptBody || !notes || tags.length === 0) {
    showToast("Fill in every field before publishing.");
    return;
  }

  try {
    const data = await fetchJson("/api/prompts", {
      body: JSON.stringify({
        author,
        category,
        model,
        notes,
        prompt: promptBody,
        remixSourceId: state.remixSourceId,
        summary,
        tags,
        title,
      }),
      method: "POST",
    });

    elements.form.reset();
    clearRemix();
    state.activePromptId = data?.prompt?.id || state.activePromptId;
    await loadAppData();
    showToast(`Published "${title}"`);
    elements.exploreSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showToast(error.message || "Could not publish to the backend.");
  }
}

function handleCategoryClick(event) {
  const button = event.target.closest("[data-category]");

  if (!button) {
    return;
  }

  state.category = button.dataset.category;
  rerender();
}

function handleFeedActions(event) {
  const openButton = event.target.closest("[data-open-id]");
  const copyButton = event.target.closest("[data-copy-id]");
  const saveButton = event.target.closest("[data-save-id]");
  const remixButton = event.target.closest("[data-remix-id]");

  if (openButton) {
    openPrompt(openButton.dataset.openId);
    return;
  }

  if (copyButton) {
    copyPrompt(copyButton.dataset.copyId);
    return;
  }

  if (saveButton) {
    toggleSave(saveButton.dataset.saveId);
    return;
  }

  if (remixButton) {
    startRemix(remixButton.dataset.remixId);
  }
}

function setSearchFromInput() {
  state.search = elements.searchInput.value.trim();
  rerender();
}

function setupEventListeners() {
  elements.searchInput.addEventListener("input", setSearchFromInput);
  elements.sortSelect.addEventListener("change", () => {
    state.sort = elements.sortSelect.value;
    rerender();
  });
  elements.categoryStrip.addEventListener("click", handleCategoryClick);
  elements.promptList.addEventListener("click", handleFeedActions);
  elements.detailContent.addEventListener("click", handleFeedActions);
  elements.heroFeatured.addEventListener("click", handleFeedActions);
  elements.form.addEventListener("submit", handleFormSubmit);
  elements.form.addEventListener("reset", resetFormState);
  elements.clearRemix.addEventListener("click", clearRemix);
  elements.browseCta.addEventListener("click", () => {
    elements.exploreSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  elements.submitCta.addEventListener("click", () => {
    elements.submitSection.scrollIntoView({ behavior: "smooth", block: "start" });
    formFields.title.focus();
  });
}

setupEventListeners();
rerender();
redirectFileModeToLocalApp();
loadAppData();
