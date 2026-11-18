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

      <h2>Why you can trust it</h2>
      <ul>
        <li>
          <strong>Official sources only.</strong> Every figure names the official source it comes from.
        </li>
        <li>
          <strong>Nothing is made up or filled in.</strong> If a figure is missing, it shows as missing, not as a guess
          or a zero.
        </li>
        <li>
          <strong>Our own calculations are labelled.</strong> When FinStats works something out, such as a change since
          the previous period, it says so.
        </li>
        <li>
          <strong>AI is used for summaries only.</strong> The only AI text is a short, clearly labelled summary of Bank
          of England publications. The numbers never come from AI.
        </li>
      </ul>
      <p>
        <a className="fs-link" href="/sources">How we check the data</a>
        {" · "}
        <a className="fs-link" href="/economy#ai-summary">Read the AI summary</a>
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
