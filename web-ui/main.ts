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

  spans.forEach((s, i) => {
    if (!editable(s)) return;

    const lang = s.getAttribute("lang") ?? "";
    const bad = !isIso6391Code(lang);

    s.style.cssText =
      `background:${bad ? "#ffd8d8" : "#fff3bf"};` +
      `outline:${orig[i] === active ? "2px solid #2457d6" : "none"}`;

    s.title = bad
      ? lang
        ? `Invalid ISO 639-1 code: ${lang}`
        : "Needs a language"
      : `lang=${lang}`;
  });

  $<HTMLIFrameElement>("preview").srcdoc =
    `<body style="font:16px/1.5 system-ui;margin:12px">` +
    `${clone.innerHTML}</body>`;
}

function renderRows() {
  const rows = $("rows");
  rows.textContent = "";

  const list = spansOf().filter(editable);

  if (!list.length) {
    rows.textContent = "No non-Latin text found. Nothing to tag.";
  }

  list.forEach((span) => {
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");

    const txt = document.createElement("div");
    txt.className = "txt";
    txt.textContent = span.textContent;

    const meta = document.createElement("div");
    meta.className = "meta";

    const cands: string[] = (
      span.getAttribute("data-candidates") ?? ""
    )
      .split(",")
      .filter(Boolean);

    const low =
      span.getAttribute("data-confidence") === "low";

    const lbl = () => {
      const l = span.getAttribute("lang") ?? "";

      if (l && isIso6391Code(l)) {
        return `Tagged as ${langName(l)}.`;
      }

      if (l) {
        return `“${l}” is not a valid ISO 639-1 code. Please choose a valid code.`;
      }

      return low
        ? "Not sure which language this is. Please choose one."
        : "Needs a language. Please choose one.";
    };

    meta.textContent = lbl();

    const setLang = (v: string) => {
      if (isIso6391Code(v)) {
        span.setAttribute("lang", v);
        confirmed.add(span);
        meta.textContent = lbl();
      } else {
        span.removeAttribute("lang");

        meta.textContent = v
          ? "Enter a valid two-letter ISO 639-1 language code."
          : lbl();
      }

      row.classList.toggle(
        "needs",
        !isIso6391Code(span.getAttribute("lang") ?? ""),
      );

      refreshApply();
      updatePreview(span);
    };

    // Waterfall: copy this row's language to other spans of the same script.
    const key = span.getAttribute("data-candidates");

    const others = () =>
      spansOf().filter(
        (s) =>
          s !== span &&
          editable(s) &&
          !confirmed.has(s) &&
          s.getAttribute("data-candidates") === key &&
          s.getAttribute("lang") !== span.getAttribute("lang"),
      );

    const apply = document.createElement("button");
    apply.className = "secondary small";

    apply.addEventListener("click", () => {
      const l = span.getAttribute("lang");

      if (!l || !isIso6391Code(l)) return;

      others().forEach((s) => s.setAttribute("lang", l));

      renderRows();
    });

    const refreshApply = () => {
      const n = others().length;
      const l = span.getAttribute("lang");

      apply.hidden = !(l && isIso6391Code(l) && n > 0);

      apply.textContent =
        `Use ${langName(l ?? "")} for ${n} other ` +
        `span${n === 1 ? "" : "s"} like this`;
    };

    left.append(txt, meta, apply);

    const ctl = document.createElement("div");
    ctl.className = "ctl";

    const other = document.createElement("input");
    other.maxLength = 2;
    other.placeholder = "xx";

    other.setAttribute(
      "aria-label",
      `Other language code for ${span.textContent}`,
    );

    other.addEventListener("input", () => {
      const v = other.value.trim().toLowerCase();

      other.classList.toggle(
        "bad",
        v !== "" && !isIso6391Code(v),
      );

      setLang(v);
    });

    other.addEventListener("focus", () => {
      row.classList.add("active");
      updatePreview(span);
    });

    other.addEventListener("blur", () =>
      row.classList.remove("active"),
    );

    if (cands.length) {
      const select = document.createElement("select");

      select.setAttribute(
        "aria-label",
        `Language for ${span.textContent}`,
      );

      const add = (value: string, label: string) => {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label;
        select.append(o);
      };

      add("", "Choose a language…");

      cands.forEach((c) => {
        if (isIso6391Code(c)) {
          add(c, `${langName(c)} (${c})`);
        }
      });

      add("__other", "Other…");

      const cur = span.getAttribute("lang") ?? "";

      if (cur && !cands.includes(cur)) {
        select.value = "__other";
        other.value = cur;
        other.hidden = false;
      } else {
        select.value = cur;
        other.hidden = true;
      }

      select.addEventListener("change", () => {
        if (select.value === "__other") {
          other.hidden = false;
          other.focus();
          setLang(other.value.trim().toLowerCase());
        } else {
          other.hidden = true;
          setLang(select.value);
        }
      });

      select.addEventListener("focus", () => {
        row.classList.add("active");
        updatePreview(span);
      });

      select.addEventListener("blur", () =>
        row.classList.remove("active"),
      );

      ctl.append(select);
    }

    ctl.append(other);

    if (!cands.length) {
      other.value = span.getAttribute("lang") ?? "";
    }

    refreshApply();

    row.classList.toggle(
      "needs",
      !isIso6391Code(span.getAttribute("lang") ?? ""),
    );

    row.append(left, ctl);
    rows.append(row);
  });

  updatePreview();
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

  renderRows();
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