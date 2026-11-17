import { tagHtml } from "../core/span-insert";
import { finalizeHtml } from "../core/finalize";
import { isIso6391Code } from "../core/iso-639-1";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const names = new Intl.DisplayNames(["en"], { type: "language" });

const langName = (c: string) => {
  try {
    return names.of(c) ?? c;
  } catch {
    return c;
  }
};



// Inert document: DOMParser never runs scripts or loads images.
let work: HTMLElement | null = null;
let selectedSpan: HTMLElement | null = null;

// Spans whose language the user chose directly on their own row.
const confirmed = new WeakSet<Element>();

function spansOf(): HTMLElement[] {
  return Array.from(
    work?.querySelectorAll<HTMLElement>("[lang], span[data-needs-language], [data-review-editable]") ?? [],
  );
}

const flagged = (s: HTMLElement) =>
  s.hasAttribute("data-needs-language");

// All elements with lang attribute are editable
function editable(span: HTMLElement): boolean {
  return span.hasAttribute("lang") || flagged(span) || span.hasAttribute("data-review-editable");
}

function isAuthorTag(span: HTMLElement): boolean {
  return (
    span.hasAttribute("lang") &&
    !span.hasAttribute("data-candidates") &&
    !span.hasAttribute("data-needs-language")
  );
}

function updatePreview(active?: HTMLElement, focusEditor = false) {
  if (!work) return;

  const clone = work.cloneNode(true) as HTMLElement;

  // Keep this selector identical for the original and cloned DOM.
  const selector = "[lang], span[data-needs-language], [data-review-editable]";
  const orig = Array.from(
    work.querySelectorAll<HTMLElement>(selector),
  );

  const elements = Array.from(
    clone.querySelectorAll<HTMLElement>(selector),
  );

  const activeIndex = active ? orig.indexOf(active) : -1;
  const activeCandidates = active?.getAttribute("data-candidates") ?? "";
  const activeLanguage = active?.getAttribute("lang") ?? "";

  const hasMatchingGroup = Boolean(
    active &&
    activeCandidates &&
    isIso6391Code(activeLanguage) &&
    !isAuthorTag(active),
  );

  elements.forEach((s, i) => {
    const original = orig[i];
    if (!original || !editable(original)) return;

    const isSelected = i === activeIndex;
    const authorTag = isAuthorTag(original);

    // An author tag that wraps other tagged elements (for example a span the tool
    // generated inside it) would be fully covered by its child's background and
    // disappear from view. Frame it so every author tag stays visible.
    const wrapsEditable = authorTag && s.querySelector(selector) !== null;

    const isMatching =
      hasMatchingGroup &&
      i !== activeIndex &&
      !authorTag &&
      !confirmed.has(original) &&
      original.hasAttribute("data-candidates") &&
      original.getAttribute("data-candidates") === activeCandidates &&
      original.getAttribute("lang") !== activeLanguage;

    const lang = s.getAttribute("lang") ?? "";
    const bad = !lang || (!isIso6391Code(lang) && !authorTag);

    s.dataset.previewId = String(i);
    s.setAttribute("role", "button");
    s.setAttribute("tabindex", "0");

    s.setAttribute(
      "aria-label",
      `${
        isSelected
          ? "Selected language tag"
          : authorTag
            ? `Author-provided language tag: ${lang}`
            : isMatching
              ? "Matching span; eligible for bulk language change"
              : "Change language for"
      }: ${s.textContent}`,
    );

    const background = isSelected
      ? "#fff3bf"
      : isMatching
        ? "#dcecff"
        : authorTag
          ? "#eee7ff"
          : bad
            ? "#ffd8d8"
            : "#fff3bf";

    const outline = isSelected
      ? "2px solid #2457d6"
      : isMatching
        ? "2px dashed #2457d6"
        : authorTag
          ? "1px solid #8b70c5"
          : "none";

    s.style.cssText =
      `background:${background};` +
      `outline:${outline};` +
      (wrapsEditable
        ? "padding:0 3px;border:2px solid #8b70c5;border-radius:3px;"
        : "") +
      `text-decoration:${isMatching ? "underline dotted #2457d6 2px" : "none"};` +
      "text-underline-offset:3px;cursor:pointer";

    s.title = isSelected
      ? "Selected language tag"
      : authorTag
        ? `Author-provided language tag: ${lang}` +
          (wrapsEditable ? " (contains other tagged text)" : "")
        : isMatching
          ? "Matching span: eligible for the same bulk language change"
          : bad
            ? lang
              ? `Invalid language code: ${lang}`
              : "Needs a language"
            : `lang=${lang}`;
  });

  const frame = $<HTMLIFrameElement>("preview");

  // Preserve the preview's scroll position when its contents are refreshed.
  const previewScrollTop =
    frame.contentWindow?.scrollY ??
    frame.contentDocument?.documentElement.scrollTop ??
    0;

  
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument || frame.contentWindow?.document;
    frame.style.height = doc?.documentElement.scrollHeight + 'px';
  });

  frame.onload = () => {
    const doc = frame.contentDocument;
    if (!doc) return;


    const activate = (target: EventTarget | null) => {
      if (!target || typeof (target as Element).closest !== "function") {
        return;
      }

      const marked = (target as Element).closest<HTMLElement>(
        "[data-preview-id]",
      );

      if (!marked) return;

      const original = orig[Number(marked.dataset.previewId)];
      if (!(original instanceof HTMLElement)) return;

      selectedSpan = original;
      renderInlineEditor();
      updatePreview(original, true);
    };

    doc.addEventListener("click", (event) => activate(event.target));

    doc.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " " && event.code !== "Space") return;

      const target = event.target;

      if (
        !target ||
        typeof (target as Element).closest !== "function" ||
        !(target as Element).closest("[data-preview-id]")
      ) {
        return;
      }

      event.preventDefault();
      activate(target);
    });

    // Restore the previous scroll position after the preview loads.
    doc.documentElement.scrollTop = previewScrollTop;
    doc.body.scrollTop = previewScrollTop;

    if (focusEditor) {
      $("inline-editor").querySelector("select")?.focus();
    }
  };

  frame.srcdoc =
    `<body style="font:16px/1.5 system-ui;margin:12px">` +
    `${clone.innerHTML}</body>`;
}

function renderInlineEditor() {
  const panel = $("inline-editor");
  panel.textContent = "";

  if (!selectedSpan || !work?.contains(selectedSpan)) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;

  const heading = document.createElement("strong");
  heading.textContent = `Change language for: ${selectedSpan.textContent}`;

  const controls = document.createElement("div");
  controls.className = "bar";

  const candidates = (selectedSpan.getAttribute("data-candidates") ?? "")
    .split(",")
    .filter(isIso6391Code);

  const current = selectedSpan.getAttribute("lang") ?? "";
  const originalLanguage =
  selectedSpan.getAttribute("data-original-lang") ?? "";

  // Author-provided tags have a lang attribute but no tool-generated
  // candidate metadata or unresolved-review marker.
  const isAuthorTag = (span: HTMLElement) =>
    span.hasAttribute("lang") &&
    !span.hasAttribute("data-candidates") &&
    !span.hasAttribute("data-needs-language");

  const authorTag = isAuthorTag(selectedSpan);

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Suggested language");

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a language…";
  select.append(placeholder);

  candidates.forEach((code) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${langName(code)} (${code})`;
    select.append(option);
  });

  // Preserve an existing ISO code even if it is not in the suggestions.
  if (isIso6391Code(current) && !candidates.includes(current)) {
    const option = document.createElement("option");
    option.value = current;
    option.textContent = `${langName(current)} (${current})`;
    select.append(option);
  }

  // Author-provided BCP 47 tags may be longer than ISO 639-1 codes.
  // Keep them intact unless the user explicitly chooses another value.
  if (authorTag && current && !isIso6391Code(current)) {
    const preserveOption = document.createElement("option");
    preserveOption.value = "__preserve";
    preserveOption.textContent = `Keep existing tag: ${current}`;
    select.append(preserveOption);
  }

  if (originalLanguage) {
    const restoreOption = document.createElement("option");
    restoreOption.value = "__restore";
    restoreOption.textContent =
      `Restore original tag: ${originalLanguage}`;
    select.append(restoreOption);
  }

  const otherOption = document.createElement("option");
  otherOption.value = "__other";
  otherOption.textContent = "Other ISO 639-1 code…";
  select.append(otherOption);

  // Removing a tag is an explicit action, not the result of an empty input.
  if (current) {
    const removeOption = document.createElement("option");
    removeOption.value = "__remove";
    removeOption.textContent = "Remove language tag";
    select.append(removeOption);
  }

  const input = document.createElement("input");
  input.maxLength = 2;
  input.placeholder = "xx";
  input.setAttribute("aria-label", "Other ISO 639-1 language code");
  input.hidden = true;

  const feedback = document.createElement("span");
  feedback.className = "meta";
  feedback.setAttribute("role", "status");

  if (authorTag && current && !isIso6391Code(current)) {
    select.value = "__preserve";
  } else if (current && (candidates.includes(current) || isIso6391Code(current))) {
    select.value = current;
  }

  // Waterfall only targets tool-generated spans with the exact same
  // nonempty candidate set. Author-provided tags are never included.
  const candidateKey = selectedSpan.getAttribute("data-candidates");

  const otherMatchingSpans = () =>
    candidateKey
      ? spansOf().filter(
          (span) =>
            span !== selectedSpan &&
            editable(span) &&
            !isAuthorTag(span) &&
            span.hasAttribute("data-candidates") &&
            !confirmed.has(span) &&
            span.getAttribute("data-candidates") === candidateKey &&
            span.getAttribute("lang") !== selectedSpan?.getAttribute("lang"),
        )
      : [];

  const waterfall = document.createElement("button");
  waterfall.className = "secondary small";

  const refreshWaterfall = () => {
    const language = selectedSpan?.getAttribute("lang") ?? "";
    const count = otherMatchingSpans().length;

    waterfall.hidden = !isIso6391Code(language) || count === 0;

    waterfall.textContent =
      `Use ${langName(language)} for ${count} other matching span` +
      (count === 1 ? "" : "s");
  };

  const applyLanguage = (value: string) => {
    const code = value.trim().toLowerCase();

    if (isIso6391Code(code)) {
      selectedSpan?.setAttribute("lang", code);

      if (selectedSpan) confirmed.add(selectedSpan);

      feedback.textContent = `Language set to ${langName(code)} (${code}).`;
    } else {
      feedback.textContent =
        "Enter a valid two-letter ISO 639-1 language code.";
      return;
    }

    updatePreview(selectedSpan ?? undefined);
    refreshWaterfall();
  };

  select.addEventListener("change", () => {
    const value = select.value;

    if (value === "__preserve") {
      input.hidden = true;
      feedback.textContent = `Keeping existing language tag: ${current}.`;
      refreshWaterfall();
      return;
    }

    if (value === "__other") {
      input.hidden = false;
      input.value = "";
      input.focus();
      return;
    }

    input.hidden = true;

    if (value === "__restore") {
      selectedSpan?.setAttribute("lang", originalLanguage);

      if (selectedSpan) confirmed.add(selectedSpan);

      input.hidden = true;
      feedback.textContent =
        `Restored original language tag: ${originalLanguage}.`;

      updatePreview(selectedSpan ?? undefined);
      refreshWaterfall();
      return;
    }

    if (value === "__remove") {
      if (
        selectedSpan &&
        !selectedSpan.hasAttribute("data-original-lang")
      ) {
        selectedSpan.setAttribute("data-original-lang", current);
      }

      selectedSpan?.removeAttribute("lang");
      selectedSpan?.setAttribute("data-review-editable", "true");

      if (selectedSpan) confirmed.add(selectedSpan);

      feedback.textContent = "Language tag removed. You can restore it.";
      updatePreview(selectedSpan ?? undefined);
      refreshWaterfall();
      return;
    }

    if (value) {
      applyLanguage(value);
    }
  });

  input.addEventListener("change", () => {
    if (!input.value.trim()) {
      feedback.textContent = "Enter a language code, or choose an existing option.";
      return;
    }

    applyLanguage(input.value);
  });

  waterfall.addEventListener("click", () => {
    const language = selectedSpan?.getAttribute("lang") ?? "";

    if (!isIso6391Code(language)) return;

    // Waterfall changes are deliberately NOT added to `confirmed`.
    // This allows a later waterfall to replace propagated assignments.
    otherMatchingSpans().forEach((span) => {
      span.setAttribute("lang", language);
    });

    updatePreview(selectedSpan ?? undefined);
    refreshWaterfall();

    feedback.textContent =
      `Applied ${langName(language)} to matching spans.`;
  });

  controls.append(select, input, waterfall);
  panel.append(heading, controls, feedback);

  refreshWaterfall();
}

$("tag").addEventListener("click", () => {
  const tagged = tagHtml(
    $<HTMLTextAreaElement>("input").value,
    {
      includeNumbers: $<HTMLInputElement>("numbers").checked,
    },
  );

  work = new DOMParser().parseFromString(
    `<body>${tagged}</body>`,
    "text/html",
  ).body;

  // Low-confidence guesses are not tagged until the user confirms them.
  work
    .querySelectorAll<HTMLSpanElement>(
      'span[data-confidence="low"]',
    )
    .forEach((s) => {
      s.removeAttribute("lang");
      s.setAttribute("data-needs-language", "true");
    });

  $("review").hidden = false;
  $("result").hidden = true;
  $("msg").textContent = "";

  selectedSpan = null;
  $("inline-editor").hidden = true;
  updatePreview();
});

$("finalize").addEventListener("click", () => {
  if (!work) return;

  const finalWork = work.cloneNode(true) as HTMLElement;

  finalWork
  .querySelectorAll("[data-review-editable], [data-original-lang]")
  .forEach((el) => {
    el.removeAttribute("data-review-editable");
    el.removeAttribute("data-original-lang");
  });

  const res = finalizeHtml(finalWork.innerHTML);
  const msg = $("msg");

  if (!res.ok) {
    msg.className = "err";

    const parts: string[] = [];

    if (res.unresolved.length) {
      parts.push(
        `${res.unresolved.length} tag(s) still need a language: ` +
          res.unresolved
            .map((u) => `“${u.text}”`)
            .join(", "),
      );
    }

    if (res.invalid.length) {
      parts.push(
        `${res.invalid.length} tag(s) have invalid ISO 639-1 codes: ` +
          res.invalid
            .map((u) => `“${u.lang}” for “${u.text}”`)
            .join(", "),
      );
    }

    msg.textContent = parts.join(" ");
    $("result").hidden = true;
    return;
  }

  msg.className = "ok";
  msg.textContent = "Done. Final HTML has no review markers.";

  $<HTMLTextAreaElement>("output").value = res.html;
  $("result").hidden = false;
});

$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(
    $<HTMLTextAreaElement>("output").value,
  );

  $("copy").textContent = "Copied!";

  setTimeout(
    () => ($("copy").textContent = "Copy to clipboard"),
    1500,
  );
});