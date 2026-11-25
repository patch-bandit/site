import {
  GUIDED_GOALS,
  GUIDED_HOSTS,
  getGuidedPlan,
  type GuidedGoal,
  type GuidedHost,
  type GuidedPlan,
  type StudioTabId,
} from "./lib/index.ts";
import { el } from "./ui-dom.ts";

export interface GuidedStartOptions {
  onApplyPlan: (plan: GuidedPlan) => void;
  onResetPlan: () => void;
  onSelectTab: (tab: StudioTabId) => void;
}

export interface GuidedStartController {
  el: HTMLElement;
  syncActiveTab: (tab: StudioTabId) => void;
  getPlan: () => GuidedPlan | null;
}

/**
 * Guided start card at the top of the generator.
 * Stores choices in session memory only (no cookies, no localStorage, no sessionStorage).
 */
export function createGuidedStart(opts: GuidedStartOptions): GuidedStartController {
  let goal: GuidedGoal | null = null;
  let host: GuidedHost | null = null;
  let plan: GuidedPlan | null = null;
  let skipped = false;
  let currentTab: StudioTabId = "make";

  const root = el("section", {
    id: "qr-guided-start",
    class: "card qr-guided",
    "aria-labelledby": "qr-guided-h",
  });

  // Collapsed bar (when skipped)
  const btnShowGuide = el("button", { id: "qr-guided-show", type: "button", class: "qr-chip" }, "Open guided start");
  const collapsedBar = el(
    "div",
    { class: "qr-guided-collapsed", hidden: "" },
    el("span", { class: "qr-guided-collapsed-txt" }, "Using the full studio view. Need help picking the right path for your website?"),
    btnShowGuide,
  );

  // Full guided body
  const fullWrap = el("div", { class: "qr-guided-wrap" });

  const heading = el("h3", { id: "qr-guided-h", class: "qr-guided-h" }, "Not sure where to start? Pick your path in 2 quick clicks.");
  const btnSkip = el("button", { id: "qr-guided-skip", type: "button", class: "qr-link-btn" }, "Skip guided start");
  const btnStartOver = el("button", { id: "qr-guided-reset", type: "button", class: "qr-link-btn", hidden: "" }, "Start over");
  const topControls = el("div", { class: "qr-guided-top-actions" }, btnStartOver, btnSkip);
  const topRow = el("div", { class: "qr-guided-head" }, heading, topControls);

  // Question 1: What brought you here?
  const q1Wrap = el("div", { class: "qr-guided-q" });
  const q1Prompt = el("p", { class: "qr-guided-prompt" }, "1 of 2: What brought you here today?");
  const q1Grid = el("div", { class: "qr-guided-goals", role: "group", "aria-label": "What brought you here" });
  const goalButtons = new Map<GuidedGoal, HTMLButtonElement>();
  for (const g of GUIDED_GOALS) {
    const btn = el(
      "button",
      {
        type: "button",
        class: "qr-guided-card",
        "data-guided-goal": g.id,
        "aria-pressed": "false",
      },
      el("span", { class: "qr-guided-card-title" }, g.label),
      el("span", { class: "qr-guided-card-blurb" }, g.blurb),
    );
    btn.addEventListener("click", () => {
      goal = g.id;
      if (host) {
        applyChoice();
      } else {
        render();
      }
    });
    goalButtons.set(g.id, btn);
    q1Grid.append(btn);
  }
  q1Wrap.append(q1Prompt, q1Grid);

  // Question 2: Where is your website hosted?
  const q2Wrap = el("div", { class: "qr-guided-q", hidden: "" });
  const q2Prompt = el("p", { class: "qr-guided-prompt" }, "2 of 2: Where is your website hosted?");
  const btnBackToQ1 = el("button", { type: "button", class: "qr-link-btn" }, "Change first answer");
  const q2Head = el("div", { class: "qr-guided-q2-head" }, q2Prompt, btnBackToQ1);
  const q2Grid = el("div", { class: "qr-guided-hosts", role: "group", "aria-label": "Where your website is hosted" });
  const hostButtons = new Map<GuidedHost, HTMLButtonElement>();
  for (const h of GUIDED_HOSTS) {
    const btn = el(
      "button",
      {
        type: "button",
        class: "qr-guided-host-btn",
        "data-guided-host": h.id,
        "aria-pressed": "false",
      },
      el("span", { class: "qr-guided-host-name" }, h.label),
      el("span", { class: "qr-guided-host-tag" }, h.tag),
    );
    btn.addEventListener("click", () => {
      host = h.id;
      applyChoice();
    });
    hostButtons.set(h.id, btn);
    q2Grid.append(btn);
  }
  q2Wrap.append(q2Head, q2Grid);

  // Active plan view
  const planWrap = el("div", { class: "qr-guided-plan", hidden: "" });
  const planSummary = el("p", { class: "qr-guided-summary" });
  const planStepsGrid = el("div", { class: "qr-guided-steps", role: "list" });
  const planGuideLink = el("a", { id: "qr-guided-guide-link", class: "btn alt", href: "/tools/qr-code-generator/guides/" }, "Open setup guide");
  const btnChangeHost = el("button", { type: "button", class: "qr-chip" }, "Change host");
  const planActions = el("div", { class: "qr-actions", style: "margin-top:0.9rem;margin-bottom:0" }, planGuideLink, btnChangeHost);
  const planDevText = el("p", { class: "qr-fine" });
  const planDevDetails = el("details", { class: "qr-campaign" }, el("summary", {}, "Note for your developer"), planDevText);
  planWrap.append(planSummary, planStepsGrid, planActions, planDevDetails);

  fullWrap.append(topRow, q1Wrap, q2Wrap, planWrap);
  root.append(collapsedBar, fullWrap);

  const stepCards: { tab: StudioTabId; node: HTMLButtonElement }[] = [];

  function applyChoice() {
    if (!goal || !host) return;
    plan = getGuidedPlan(goal, host);
    currentTab = plan.initialTab;
    render();
    opts.onApplyPlan(plan);
  }

  function resetAll() {
    goal = null;
    host = null;
    plan = null;
    skipped = false;
    opts.onResetPlan();
    render();
  }

  btnSkip.addEventListener("click", () => {
    skipped = true;
    render();
  });
  btnShowGuide.addEventListener("click", () => {
    skipped = false;
    render();
  });
  btnStartOver.addEventListener("click", resetAll);
  btnBackToQ1.addEventListener("click", () => {
    goal = null;
    host = null;
    plan = null;
    opts.onResetPlan();
    render();
  });
  btnChangeHost.addEventListener("click", () => {
    host = null;
    plan = null;
    opts.onResetPlan();
    render();
  });

  function syncStepHighlights() {
    for (const s of stepCards) {
      const active = s.tab === currentTab;
      s.node.classList.toggle("on", active);
      s.node.setAttribute("aria-current", active ? "step" : "false");
    }
  }

  function render() {
    root.classList.toggle("is-collapsed", skipped);
    collapsedBar.hidden = !skipped;
    fullWrap.hidden = skipped;
    if (skipped) return;

    for (const [id, btn] of goalButtons) {
      const on = id === goal;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    }
    for (const [id, btn] of hostButtons) {
      const on = id === host;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    }

    if (plan) {
      heading.textContent = plan.headline;
      btnStartOver.hidden = false;
      btnSkip.textContent = "Hide guide";
      q1Wrap.hidden = true;
      q2Wrap.hidden = true;
      planWrap.hidden = false;

      planSummary.textContent = plan.summary;
      planGuideLink.setAttribute("href", plan.guidePath);
      planGuideLink.textContent = plan.guideLabel;
      planDevText.textContent = plan.devNote;

      planStepsGrid.replaceChildren();
      stepCards.length = 0;
      for (const st of plan.steps) {
        const card = el(
          "button",
          { type: "button", class: "qr-guided-step-card", "data-guided-step": String(st.step) },
          el("span", { class: "qr-guided-step-num" }, `Step ${st.step}`),
          el("span", { class: "qr-guided-step-title" }, st.title),
          el("span", { class: "qr-guided-step-detail" }, st.detail),
        );
        card.addEventListener("click", () => {
          currentTab = st.tab;
          syncStepHighlights();
          opts.onSelectTab(st.tab);
        });
        stepCards.push({ tab: st.tab, node: card });
        planStepsGrid.append(card);
      }
      syncStepHighlights();
    } else if (goal) {
      heading.textContent = "Step 2 of 2: Where is your website hosted?";
      btnStartOver.hidden = false;
      btnSkip.textContent = "Skip guided start";
      q1Wrap.hidden = true;
      q2Wrap.hidden = false;
      planWrap.hidden = true;
    } else {
      heading.textContent = "Not sure where to start? Pick your path in 2 quick clicks.";
      btnStartOver.hidden = true;
      btnSkip.textContent = "Skip guided start";
      q1Wrap.hidden = false;
      q2Wrap.hidden = true;
      planWrap.hidden = true;
    }
  }

  render();

  return {
    el: root,
    syncActiveTab(tab: StudioTabId) {
      currentTab = tab;
      syncStepHighlights();
    },
    getPlan: () => plan,
  };
}
