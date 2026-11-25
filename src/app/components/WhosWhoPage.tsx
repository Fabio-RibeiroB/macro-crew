// Who's who: the UK institutions whose figures and decisions FinStats cites, in a few
// plain sentences each (ADR 0004). It states no figures; each entry links to the
// FinStats page that uses the institution's data and to its own official site.
import { OfficialLink } from "./OfficialLink";
import { PageContents } from "./PageContents";
import "../../styles/whos-who.css";

type Institution = {
  id: string;
  name: string;
  short: string;
  summary: string;
  links: { href: string; label: string }[];
  official: { href: string; label: string };
};

export const INSTITUTIONS: Institution[] = [
  {
    id: "mpc",
    name: "Monetary Policy Committee (MPC)",
    short: "MPC",
    summary:
      "The MPC is a nine-member committee at the Bank of England. It meets eight times a year to vote on Bank Rate, aiming to keep inflation (CPI) close to the government’s 2% target. Its decisions feed through to mortgage, loan and savings rates.",
    links: [
      { href: "/economy#interest-rates", label: "Bank Rate on FinStats" },
      { href: "/calendar", label: "Meeting dates" },
    ],
    official: { href: "https://www.bankofengland.co.uk/about/people/monetary-policy-committee", label: "Bank of England: the MPC" },
  },
  {
    id: "boe",
    name: "Bank of England (BoE)",
    short: "Bank of England",
    summary:
      "The UK’s central bank. It sets monetary policy, watches over the stability of the financial system and publishes Bank Rate, gilt yields and mortgage rates, plus the Monetary Policy and Financial Stability Reports. Its decisions affect what you pay on borrowing and earn on savings.",
    links: [
      { href: "/economy#interest-rates", label: "Bank Rate" },
      { href: "/government-budget", label: "Gilt yields" },
      { href: "/housing", label: "Mortgage rates" },
    ],
    official: { href: "https://www.bankofengland.co.uk", label: "Bank of England" },
  },
  {
    id: "ons",
    name: "Office for National Statistics (ONS)",
    short: "ONS",
    summary:
      "The UK’s independent statistics agency. It produces CPI and CPIH inflation, GDP, pay, unemployment, private rents and public sector net debt. These are the official measures of how prices, jobs and the economy are changing for households.",
    links: [
      { href: "/prices#figures", label: "Inflation" },
      { href: "/jobs-pay", label: "Jobs and pay" },
      { href: "/housing", label: "Private rents" },
      { href: "/government-budget", label: "Public sector net debt" },
    ],
    official: { href: "https://www.ons.gov.uk", label: "Office for National Statistics" },
  },
  {
    id: "ofgem",
    name: "Ofgem",
    short: "Ofgem",
    summary:
      "The energy regulator for Great Britain. It sets the quarterly energy price cap, which limits what suppliers can charge per unit on default tariffs. Changes to the cap flow straight into many household energy bills.",
    links: [{ href: "/prices#household-energy", label: "Household energy" }],
    official: {
      href: "https://www.ofgem.gov.uk/energy-regulation/domestic-and-non-domestic/energy-pricing-rules/energy-price-cap",
      label: "Ofgem: energy price cap",
    },
  },
  {
    id: "hm-treasury",
    name: "HM Treasury (HMT)",
    short: "HM Treasury",
    summary:
      "The UK government’s finance ministry. It sets tax and public spending policy through Budgets and other fiscal statements. Those announcements decide what you pay in tax and how much is spent on public services.",
    links: [{ href: "/government-budget", label: "Tax, spending and your household" }],
    official: { href: "https://www.gov.uk/government/organisations/hm-treasury", label: "HM Treasury" },
  },
  {
    id: "obr",
    name: "Office for Budget Responsibility (OBR)",
    short: "OBR",
    summary:
      "The UK’s independent fiscal watchdog. It publishes its own Economic and fiscal outlook forecasts alongside Budgets, rather than taking the government’s word for it. They show whether the plans add up.",
    links: [{ href: "/government-budget", label: "How to read Budget announcements" }],
    official: { href: "https://obr.uk/", label: "Office for Budget Responsibility" },
  },
  {
    id: "desnz",
    name: "Department for Energy Security and Net Zero (DESNZ)",
    short: "DESNZ",
    summary:
      "The government department for energy policy. It publishes weekly UK average petrol and diesel pump prices. They show what filling up costs on average across the country.",
    links: [{ href: "/prices#petrol-diesel", label: "Petrol and diesel" }],
    official: { href: "https://www.gov.uk/government/statistics/weekly-road-fuel-prices", label: "DESNZ: weekly road fuel prices" },
  },
  {
    id: "land-registry",
    name: "HM Land Registry",
    short: "HM Land Registry",
    summary:
      "The government body that records property ownership in England and Wales. It publishes the official UK House Price Index (UK HPI) of average sold prices, working with the ONS and the other UK land registries.",
    links: [{ href: "/housing#house-prices", label: "House prices" }],
    official: { href: "https://www.gov.uk/government/collections/uk-house-price-index-reports", label: "UK House Price Index reports" },
  },
];

export function WhosWhoPage() {
  return (
    <section className="fs-container fs-section">
      <div className="fs-whos">
        <PageContents items={INSTITUTIONS.map((item) => ({ id: item.id, label: item.short }))} />
        <p className="fs-whos-intro">
          The same few institutions sit behind most UK economic figures. Here is who they are, what they decide or
          publish, and where to find them on FinStats UK.
        </p>
        {INSTITUTIONS.map((item) => (
          <section className="fs-whos-entry" id={item.id} key={item.id} aria-labelledby={`${item.id}-title`}>
            <h2 id={`${item.id}-title`}>{item.name}</h2>
            <p>{item.summary}</p>
            <p className="fs-whos-links">
              {item.links.map((link) => (
                <a className="fs-link" href={link.href} key={link.href + link.label}>{link.label}</a>
              ))}
              <OfficialLink href={item.official.href}>{item.official.label}</OfficialLink>
            </p>
          </section>
        ))}
        <p>
          <a className="fs-link" href="/sources">How we check the data</a>
        </p>
      </div>
    </section>
  );
}
