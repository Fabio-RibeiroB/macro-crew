// About: why the site exists, who it is for, what keeps it trustworthy and what it is
// not. Short and plain; longer detail sits in MoreDetail (ADR 0004). It deliberately
// lists no datasets: Sources is the one place that does.
import { MoreDetail } from "./MoreDetail";
import "../../styles/about.css";

export function AboutPage() {
  return (
    <section className="fs-container fs-section">
      <div className="fs-about">
      <h2>Why this site exists</h2>
      <p>
        FinStats UK helps people in the UK understand the economic numbers that affect their money: prices, interest
        rates, pay, housing and government borrowing. It uses official figures and explains them in plain English.
      </p>

      <h2>Who it is for</h2>
      <p>Anyone. You do not need to know any economics to use it.</p>

      <h2>How we try to get it right</h2>
      <ul>
        <li>
          <strong>We use official sources.</strong> Each figure names where it comes from, so you can check it.
        </li>
        <li>
          <strong>We don’t fill gaps.</strong> If a figure is missing, we aim to show it as missing rather than guess.
        </li>
        <li>
          <strong>We label our own sums.</strong> When FinStats works something out, it should say so.
        </li>
        <li>
          <strong>AI only writes summaries.</strong> AI text is labelled and can be wrong; the numbers don’t come from AI.
        </li>
      </ul>
      <h2>Early days</h2>
      <p>
        FinStats UK is new and still being built. Figures can be late, AI summaries can fail or get things wrong, and
        there will be bugs. Check the official source before relying on a number. Spotted a problem?{" "}
        <a className="fs-link" href="https://github.com/Fabio-RibeiroB/macro-crew/issues">Report it on GitHub</a>.
      </p>
      <p>
        <a className="fs-link" href="/sources">How we check the data</a>
        {" · "}
        <a className="fs-link" href="/economy#ai-summary">Read the AI summary</a>
        {" · "}
        <a className="fs-link" href="/whos-who">Who’s who in UK economic data</a>
      </p>

      <h2>What it is not</h2>
      <p>
        FinStats UK is not a government website and does not produce official statistics. It republishes official
        figures and credits their source. Nothing here is financial advice.
      </p>

      <h2>Who runs it</h2>
      <p>
        FinStats UK is an independent project run by{" "}
        <a className="fs-link" href="https://github.com/Fabio-RibeiroB">Fabio-RibeiroB on GitHub</a>. It is not
        affiliated with the ONS, the Bank of England or the government. The{" "}
        <a className="fs-link" href="https://github.com/Fabio-RibeiroB/macro-crew">code is open</a>.
      </p>

      <MoreDetail label="More about how it works">
        <p>
          Figures are collected automatically from the Office for National Statistics, the Bank of England and other
          official publishers. Each series is checked for its definition, unit and reference period, then published
          together as one consistent snapshot.
        </p>
        <p>
          Publishers can revise figures. Each figure shows when we last checked it, which is not the same as when it
          was officially released.
        </p>
        <p>
          If a source cannot be reached, the last verified figures stay available with their dates. A problem with the
          AI summaries cannot stop figures being published.
        </p>
        <p>
          AI summaries are dated and labelled. They are not official statistics and not forecasts. Visiting the site
          never starts any data collection or AI work.
        </p>
      </MoreDetail>
      </div>
    </section>
  );
}
