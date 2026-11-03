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
let selectedSpan: HTMLSpanElement | null = null;

// Spans whose language the user chose directly on their own row.
const confirmed = new WeakSet<Element>();

const spansOf = () =>
  work
    ? [
        ...work.querySelectorAll<HTMLSpanElement>(
          "span[lang], span[data-needs-language]",
        ),
      ]
    : [];

const flagged = (s: HTMLElement) =>
  s.hasAttribute("data-needs-language");

// Only spans the tool created are editable.
const editable = (s: HTMLElement) =>
  flagged(s) || s.hasAttribute("data-candidates");

function updatePreview(active?: HTMLElement) {
  if (!work) return;

  const clone = work.cloneNode(true) as HTMLElement;
  const orig = spansOf();

  const spans = [
    ...clone.querySelectorAll<HTMLElement>(
      "span[lang], span[data-needs-language]",
    ),
  ];

  const activeIndex = active ? orig.indexOf(active as HTMLSpanElement) : -1;
  const activeCandidates = active?.getAttribute("data-candidates") ?? "";
  const activeLanguage = active?.getAttribute("lang") ?? "";

  const hasMatchingGroup = Boolean(
    active && activeCandidates && isIso6391Code(activeLanguage)
  );

  spans.forEach((s, i) => {
    if (!editable(s)) return;

    const isSelected = i === activeIndex;

    const isMatching =
      hasMatchingGroup &&
      i !== activeIndex &&
      !confirmed.has(orig[i]!) &&
      orig[i]!.getAttribute("data-candidates") === activeCandidates &&
      orig[i]!.getAttribute("lang") !== activeLanguage;

    s.dataset.previewId = String(i);
    s.setAttribute("role", "button");
    s.setAttribute("tabindex", "0");

    s.setAttribute(
      "aria-label",
      `${isSelected
        ? "Selected span"
        : isMatching
          ? "Matching span; eligible for bulk language change"
          : "Change language for"}: ${s.textContent}`,
    );

    const lang = s.getAttribute("lang") ?? "";
    const bad = !isIso6391Code(lang);

    s.style.cssText =
      `background:${isMatching ? "#dcecff" : bad ? "#ffd8d8" : "#fff3bf"};` +
      `outline:${isSelected ? "2px solid #2457d6" : isMatching ? "2px dashed #2457d6" : "none"};` +
      `text-decoration:${isMatching ? "underline dotted #2457d6 2px" : "none"};` +
      "text-underline-offset:3px;cursor:pointer";

    s.title = isSelected
      ? "Selected span"
      : isMatching
        ? "Matching span: eligible for the same bulk language change"
        : bad
          ? lang
            ? `Invalid ISO 639-1 code: ${lang}`
            : "Needs a language"
          : `lang=${lang}`;
});

  const frame = $<HTMLIFrameElement>("preview");
  frame.onload = () => {
    const doc = frame.contentDocument;
    if (!doc) return;

    const activate = (target: EventTarget | null) => {
      if (!target || typeof (target as Element).closest !== "function") return;
      const marked = (target as Element).closest<HTMLElement>("[data-preview-id]");
      if (!marked) return;

      const original = orig[Number(marked.dataset.previewId)];
      if (!(original instanceof HTMLSpanElement)) return;

      selectedSpan = original;
      renderInlineEditor();
      updatePreview(original);
    };

    doc.addEventListener("click", (event) => activate(event.target));
    doc.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!target || typeof (target as Element).closest !== "function" ||
          !(target as Element).closest("[data-preview-id]")) return;
      event.preventDefault();
      activate(target);
    });
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

  const otherOption = document.createElement("option");
  otherOption.value = "__other";
  otherOption.textContent = "Other…";
  select.append(otherOption);

  const input = document.createElement("input");
  input.maxLength = 2;
  input.placeholder = "xx";
  input.setAttribute("aria-label", "Other ISO 639-1 language code");
  input.hidden = true;

  const feedback = document.createElement("span");
  feedback.className = "meta";
  feedback.setAttribute("role", "status");

  const current = selectedSpan.getAttribute("lang") ?? "";

  if (candidates.includes(current)) {
    select.value = current;
  } else if (current) {
    select.value = "__other";
    input.value = current;
    input.hidden = false;
  }

  // Waterfall targets use the same candidate set as the selected span.
  const candidateKey = selectedSpan.getAttribute("data-candidates");

  const otherMatchingSpans = () =>
    spansOf().filter(
      (span) =>
        span !== selectedSpan &&
        editable(span) &&
        !confirmed.has(span) &&
        span.getAttribute("data-candidates") === candidateKey &&
        span.getAttribute("lang") !== selectedSpan?.getAttribute("lang"),
    );

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
    } else if (!code) {
      selectedSpan?.removeAttribute("lang");
      feedback.textContent = "Language assignment cleared.";
    } else {
      feedback.textContent =
        "Enter a valid two-letter ISO 639-1 language code.";
      return;
    }

    updatePreview(selectedSpan ?? undefined);
    refreshWaterfall();
  };

  select.addEventListener("change", () => {
    if (select.value === "__other") {
      input.hidden = false;
      input.focus();
      return;
    }

    input.hidden = true;
    applyLanguage(select.value);
  });

  input.addEventListener("change", () => applyLanguage(input.value));

  
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

  const res = finalizeHtml(work.innerHTML);
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