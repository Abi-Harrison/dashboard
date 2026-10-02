import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from '@/pages/Portfolio/Portfolio.module.css';

// Live public landing (document title: Re-establish). Recovered from hosting
// so a later deploy of main serves this page instead of Welcome.

const AXIS_COLORS = [
  '#355E58',
  '#409c7c',
  '#cda94a',
  '#e7514c',
  '#927aaa',
  '#3280a7',
  '#9aa6b2',
];

const EQ_BARS = [
  { h: 86, c: '#355E58' },
  { h: 70, c: '#409c7c' },
  { h: 50, c: '#cda94a' },
  { h: 62, c: '#e7514c' },
  { h: 74, c: '#927aaa' },
  { h: 92, c: '#3280a7' },
  { h: 44, c: '#9aa6b2' },
];

const EQ_LABELS = ['Track', 'Misd', 'Env', 'Phys', 'Fin', 'Gear', 'Rest'];

const AXES = [
  {
    name: 'On Track N+1',
    tint: '#e6efed',
    spine: '#355E58',
    title: '#24403b',
    hexColor: '#355E58',
    desc: '#3a564f',
    text: 'Aligning daily action with personal values and a proactive future-plan.',
  },
  {
    name: 'Misdirect',
    tint: '#e1f1eb',
    spine: '#409c7c',
    title: '#2e6b54',
    hexColor: '#409c7c',
    desc: '#3f7a63',
    text: 'Deliberate distraction — recharge, shift gears, prevent fatigue.',
  },
  {
    name: 'Environment',
    tint: '#f4ecd4',
    spine: '#cda94a',
    title: '#7a611a',
    hexColor: '#a98f4a',
    desc: '#8a6d1f',
    text: 'Shaping your surroundings so the space reflects the inner mind.',
  },
  {
    name: 'Physical',
    tint: '#fbe3df',
    spine: '#e7514c',
    title: '#a93b36',
    hexColor: '#c06b66',
    desc: '#b3413c',
    text: 'Mastering the body — strength, habits, and how you carry yourself.',
  },
  {
    name: 'Financial',
    tint: '#ece6f2',
    spine: '#927aaa',
    title: '#6d5688',
    hexColor: '#9784ad',
    desc: '#7d669a',
    text: 'Securing survival and funding every other endeavor on the board.',
  },
  {
    name: 'Gear',
    tint: '#e1edf3',
    spine: '#3280a7',
    title: '#235f80',
    hexColor: '#5f93b0',
    desc: '#2b7196',
    text: 'A documented “mental OS” — protocols for different moods and modes.',
  },
  {
    name: 'Rest & Preparation',
    tint: '#eef1f4',
    spine: '#9aa6b2',
    title: '#5e6b75',
    hexColor: '#8995a0',
    desc: '#6b7984',
    text: 'Recovery and discipline — embed automated readiness so nothing else has to fight for it.',
    support: true,
    wide: true,
  },
];

const ZOOM_STEPS = ['Life', 'Year', 'Month', 'Week', 'Day', 'Hour'];

const ZOOM_LEVELS = [
  {
    lvl: 'Level 01 · Life',
    title: 'A 10,000-foot view of a whole life.',
    body: 'A zoomable timeline connecting long-term personal eras to tangible project outcomes — the strategic altitude every level below inherits.',
    note: 'Holds a high-level strategic vision steady across decades.',
    url: 'dashboard ⸱ life map',
    img: '/portfolio/life-map.png',
    imageLeft: false,
  },
  {
    lvl: 'Level 02 · Year',
    title: 'The same seven axes, one altitude lower.',
    body: 'Each axis becomes a measurable yearly objective with live progress — the life-map vision turned into something you can actually move this year.',
    note: 'Translates the vision into seven concrete annual targets.',
    url: 'dashboard ⸱ yearly',
    img: '/portfolio/yearly.png',
    imageLeft: true,
  },
  {
    lvl: 'Level 03 · Month',
    title: 'Where an objective becomes a plan.',
    body: 'A calendar, per-axis project controls, and a Kanban board — sprints scheduled, focus assigned week by week, and the work broken into a backlog you can actually run.',
    note: 'Turns a yearly target into scheduled, trackable projects.',
    url: 'dashboard ⸱ monthly',
    img: '/portfolio/month.png',
    imageLeft: false,
  },
  {
    lvl: 'Level 04 · Week',
    title: 'Seven axes, seven days.',
    body: 'Weekly milestones for every axis, plus a day-by-day schedule that gives each day its focus axis and goal — with momentum streaks made visible.',
    note: 'Distributes the month across a balanced, repeatable week.',
    url: 'dashboard ⸱ weekly',
    img: '/portfolio/weekly.png',
    imageLeft: true,
  },
  {
    lvl: 'Level 05 · Day',
    title: 'The day, measured.',
    body: 'Per-axis daily analytics, a roadmap of milestones, and a Pomodoro cycle-and-break analysis that studies how recovery actually affects output.',
    note: "Makes a single day's effort observable — and improvable.",
    url: 'dashboard ⸱ daily',
    img: '/portfolio/day.png',
    imageLeft: false,
  },
  {
    lvl: 'Level 06 · Hour',
    title: 'The current hour, in focus.',
    body: 'Top-3 tasks, a live task list, a Pomodoro timer, and a cycle tracker — the sharpest zoom, where the whole system resolves into the next 25 minutes.',
    note: 'Where the entire framework becomes the next concrete action.',
    url: 'dashboard ⸱ now',
    img: '/portfolio/now.png',
    imageLeft: true,
  },
];

const BUILDS = [
  {
    lvl: 'Environment axis · Family Clean',
    title: 'An AI cleaning coach the whole family actually opens.',
    body: 'An installable mobile app: snap a "before" photo and the AI writes a tailored, kid-followable chore list; clean; snap an "after" and it scores the room 1–10 by comparing the two shots. Rooms level up (Reset → Deep → Declutter → Harmonize), chores pay a real allowance, and surprise bonuses, ~90 achievements, and mindful "practices" keep it fun.',
    note: 'Turns nagging into a game the family opens on their own — the AI is the neutral judge, so effort gets rewarded without a parent policing it.',
    aside:
      "It's an adventure where you aren't sure if the AI is slowly feng shui-ing your home or clearing an escape route for the Roomba during the uprising.",
    url: 'family clean ⸱ /clean',
    phones: [
      { src: '/portfolio/Select.jpg', cap: 'Pick a room' },
      { src: '/portfolio/bonus_round.jpg', cap: 'Scored & coached' },
      { src: '/portfolio/Rewards.jpg', cap: 'The reward jar' },
      { src: '/portfolio/Awards.jpg', cap: 'Awards to unlock' },
    ],
    imageLeft: false,
  },
  {
    lvl: 'Environment axis · Parents’ Portal',
    title: 'Every clean becomes data.',
    body: 'A contribution heatmap showing who actually showed up and their longest streak; weekly allowance replayed straight from the logs, so it always matches what the kids see in their reward jar; per-room averages with trend sparklines; and a transformations feed ranking the biggest before-and-after turnarounds.',
    note: 'Surfaces who did what and which rooms are trending up or down, turning an invisible, often-contested chore load into something objective and fair.',
    url: 'family clean ⸱ portal',
    img: '/portfolio/family-clean-stats.png',
    imageLeft: true,
  },
  {
    lvl: 'Environment axis · Learning Centre',
    title: 'The awards teach you something.',
    body: 'Every achievement is drawn from one of four ways of thinking about a home — KonMari, feng shui, Denise Linn’s space clearing, and plain rhythm — and each one links to a plain-language explanation of where it comes from and what it actually means. Unlock “Clear the Chi” and you can read what chi is.',
    note: 'A chore app that smuggles in an education — the reward is the idea behind it, not just the badge.',
    url: 'family clean ⸱ learn',
    img: '/portfolio/family-clean-learn.png',
    imageLeft: false,
  },
  {
    lvl: 'Gear axis · Flash Cards',
    title: 'Spaced-review flashcards, rebuilt.',
    body: 'A Gear-axis blue bottom-sheet: pick a topic, flip a card, rate how well you know it (1–5, each card carrying its own rolling history), mark "Got it / Missed it," and finish on a session summary. Ratings feed the study analytics and the AI advisor.',
    note: 'Review aims at what is actually shaky — every card remembers its own rating history, so study targets weak spots instead of repeating what you already know.',
    url: 'dashboard ⸱ flash cards',
    phones: [{ src: '/portfolio/flashcards.jpg', cap: 'Flip, rate, repeat' }],
    imageLeft: false,
  },
];

const FUNNEL = [
  {
    w: '46%',
    minW: '240px',
    bg: '#16201d',
    color: '#fcfbf9',
    subOpacity: 0.7,
    label: 'A lifetime of meaning',
    sub: 'the throughline',
  },
  {
    w: '60%',
    minW: '260px',
    bg: '#355E58',
    color: '#fcfbf9',
    subOpacity: 0.8,
    label: 'Yearly synthesis',
    sub: 'what the year was about',
  },
  {
    w: '74%',
    bg: '#5d827b',
    color: '#fcfbf9',
    subOpacity: 0.82,
    label: 'Quarterly crystallizations',
    sub: 'what kept recurring',
  },
  {
    w: '88%',
    bg: '#9bbab2',
    color: '#16201d',
    subOpacity: 0.7,
    label: 'Weekly synthesis',
    sub: 'what you were thinking about',
  },
  {
    w: '100%',
    bg: '#e6efed',
    border: '1px solid #d4ded9',
    color: '#46554f',
    subOpacity: 0.75,
    label: 'Daily life, tracked & processed',
    sub: 'thousands of entries',
  },
];

function FrameDots() {
  return (
    <>
      <span className={styles.frameDot} style={{ background: '#e7514c' }} />
      <span className={styles.frameDot} style={{ background: '#cda94a' }} />
      <span className={styles.frameDot} style={{ background: '#409c7c' }} />
    </>
  );
}

function Screenshot({ src, label }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={styles.framePlaceholder}>{label}</div>;
  }
  return (
    <img
      src={src}
      alt={label}
      className={styles.frameImg}
      onError={() => setFailed(true)}
    />
  );
}

function PhoneStrip({ phones }) {
  return (
    <div className={styles.phoneStrip}>
      {phones.map((phone) => (
        <figure className={styles.phone} key={phone.src}>
          <div className={styles.phoneBody}>
            <span className={styles.phoneNotch} aria-hidden="true" />
            <img
              src={phone.src}
              alt={phone.cap}
              className={styles.phoneImg}
              loading="lazy"
            />
          </div>
          <figcaption className={styles.phoneCap}>{phone.cap}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function Level({ d }) {
  const frame = (
    <figure className={styles.frame} style={{ maxWidth: 540 }}>
      <div className={styles.frameBar}>
        <FrameDots />
        <span className={styles.frameUrl}>{d.url}</span>
      </div>
      <Screenshot src={d.img} label={d.url} />
    </figure>
  );

  const copy = (
    <div>
      <div className={styles.levelEyebrow}>{d.lvl}</div>
      <h3 className={styles.levelTitle}>{d.title}</h3>
      <p className={styles.levelBody}>{d.body}</p>
      <div className={styles.levelNote}>
        <span>→</span>
        <span>{d.note}</span>
      </div>
      {d.aside && <p className={styles.levelAside}>{d.aside}</p>}
    </div>
  );

  if (d.phones) {
    return (
      <div className={styles.levelStacked}>
        <div className={styles.levelStackedText}>
          <div className={styles.levelEyebrow}>{d.lvl}</div>
          <h3 className={styles.levelTitle}>{d.title}</h3>
          <p className={styles.levelBody}>{d.body}</p>
        </div>
        <PhoneStrip phones={d.phones} />
        <div className={styles.levelStackedFoot}>
          <div className={styles.levelNote}>
            <span>→</span>
            <span>{d.note}</span>
          </div>
          {d.aside && <p className={styles.levelAside}>{d.aside}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.level} ${d.imageLeft ? styles.levelImageLeft : ''}`}>
      {d.imageLeft ? (
        <>
          {frame}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {frame}
        </>
      )}
    </div>
  );
}

const Portfolio = () => {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navBrand}>
          <div className={styles.navDots}>
            {AXIS_COLORS.map((color) => (
              <span key={color} style={{ background: color }} />
            ))}
          </div>
          <span className={styles.wordmark}>The Seven-Axis System</span>
        </div>
        <div className={styles.navLinks}>
          <a href="#framework">The framework</a>
          <a href="#axes">Seven axes</a>
          <a href="#zoom">The architecture</a>
          <a href="#builds">Built with it</a>
          <a href="#distill">Meaning distillation</a>
          <Link to="/login" className={styles.navCta}>Enter the app →</Link>
        </div>
        <div className={styles.navLinksMobile}>
          <Link to="/login" className={styles.navCta}>Enter the app →</Link>
        </div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroGrid}>
          <div>
            <div className={styles.heroEyebrow}>Product & Systems Thinker</div>
            <h1 className={styles.heroTitle}>
              Balance a whole life across seven axes{' '}
              <span className={styles.red}>so I can do great things.</span>
            </h1>
            <p className={styles.heroBody}>
              A productivity system grounded in the psychology of motivation, data analytics, and adaptive agile principles. It keeps an entire life in balance: Body, Mind, Occupation and Finance, Environment, and Intentional Rest and Preparation. All are organized so you can pivot and navigate with ease. The system uses strategic misdirects to create novelty, refreshing your focus before it goes stale and increasing endurance. By shifting perspectives, your goals stay aligned across time.
            </p>
            <div className={styles.heroBtns}>
              <Link to="/demo" className={styles.btnPrimary}>Try the live demo</Link>
              <Link to="/contact" className={styles.btnSecondary}>Get in touch</Link>
            </div>
          </div>
          <div className={styles.heroCard}>
            <div className={styles.eqHead}>
              <span className={styles.eqHeadLabel}>Life, in balance</span>
              <span className={styles.eqHeadCount}>7 axes</span>
            </div>
            <div className={styles.eqBars}>
              {EQ_BARS.map((bar, index) => (
                <div className={styles.eqCol} key={index}>
                  <div
                    className={styles.eqBar}
                    style={{ height: `${bar.h}%`, background: bar.c }}
                  />
                </div>
              ))}
            </div>
            <div className={styles.eqLabels}>
              {EQ_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section id="framework" className={styles.insight}>
        <div className={styles.insightInner}>
          <div>
            <div className={styles.insightEyebrow}>The insight</div>
            <h2 className={styles.insightH2}>
              What could you <span className={styles.green}>accomplish?</span>
            </h2>
          </div>
          <p className={styles.insightBody}>
            This app is designed around motivation theory and behavioral psychology to keep you engaged: clear direction, visible progress, structured reflection, and resilience built in. It's a thesis about how a life stays in motion without burning out.
          </p>
        </div>
      </section>

      <section id="axes" className={styles.axes}>
        <div className={styles.axesHead}>
          <div>
            <div className={styles.axesEyebrow}>The framework</div>
            <h2 className={styles.axesH2}>
              Seven axes,
              <br />
              held in balance.
            </h2>
          </div>
          <p className={styles.axesIntro}>
            Every part of a life maps to one of seven axes. Progress compounds across them. Momentum in one feeds the others, and when your levels rise together, the connections between them are where creativity blooms. In this system, balance is the engine of ambition.
          </p>
        </div>
        <div className={styles.axisGrid}>
          {AXES.map((axis) => (
            <div
              key={axis.name}
              className={`${styles.axisCard} ${axis.wide ? styles.axisCardWide : ''}`}
              style={{ background: axis.tint, border: `1.5px solid ${axis.spine}` }}
            >
              <span className={styles.axisSpine} style={{ background: axis.spine }} />
              <div className={styles.axisBody}>
                <div className={styles.axisTop}>
                  <h3 className={styles.axisName} style={{ color: axis.title }}>
                    {axis.name}
                    {axis.support && (
                      <>
                        {' '}
                        <span className={styles.supportTag} style={{ color: axis.hexColor }}>
                          support axis
                        </span>
                      </>
                    )}
                  </h3>
                </div>
                <p className={styles.axisDesc} style={{ color: axis.desc }}>
                  {axis.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="zoom" className={styles.zoom}>
        <div className={styles.zoomInner}>
          <div className={styles.zoomHead}>
            <div className={styles.zoomEyebrow}>The architecture</div>
            <h2 className={styles.zoomH2}>
              Zoom from a life down to a single hour — without losing the thread.
            </h2>
            <p className={styles.zoomIntro}>
              Strategic vision and daily action live in one connected system. Drop into any level and act on it; the bigger picture never leaves the frame.
            </p>
          </div>
          <div className={styles.stepper}>
            {ZOOM_STEPS.map((step, index) => (
              <Fragment key={step}>
                <div className={styles.stepNode}>
                  <span className={styles.stepDot} />
                  <span className={styles.stepLabel}>{step}</span>
                </div>
                {index < ZOOM_STEPS.length - 1 && <div className={styles.stepLine} />}
              </Fragment>
            ))}
          </div>
          {ZOOM_LEVELS.map((level) => (
            <Level key={level.lvl} d={level} />
          ))}
        </div>
      </section>

      <section id="builds" className={styles.buildsBand}>
        <div className={styles.buildsBandInner}>
          <div className={styles.zoomEyebrow}>In the wild</div>
          <h2 className={styles.zoomH2}>
            Standalone apps <span className={styles.red}>built within the framework</span>,
            <span className={styles.zoomH2Sub}>gathering data for analysis</span>
          </h2>
          <p className={styles.zoomIntro}>
            The system isn't only theory — it produces real, deployed tools in daily use by real people. A few favorites, each mapped to its axis.
          </p>
        </div>
      </section>

      <section className={styles.zoom}>
        <div className={styles.zoomInner}>
          {BUILDS.map((level) => (
            <Level key={level.lvl} d={level} />
          ))}
        </div>
      </section>

      <section id="distill" className={styles.distill}>
        <div className={styles.distillHead}>
          <div className={styles.distillEyebrow}>The frontier</div>
          <h2 className={styles.distillH2}>An AI advisor that distills a life into meaning.</h2>
          <p className={styles.distillBody}>
            The newest layer reads your patterns and compresses years of lived data into meaning — daily life rising into weekly, quarterly, and yearly synthesis. The record gets denser and wiser over time, instead of just bigger.
          </p>
        </div>
        <div className={styles.funnel}>
          <div className={styles.funnelHead}>
            <span className={styles.funnelHeadLabel}>Distilled upward</span>
            <span className={styles.funnelHeadNote}>↑ denser & wiser</span>
          </div>
          <div className={styles.funnelStack}>
            {FUNNEL.map((step) => (
              <div
                key={step.label}
                className={styles.funnelPill}
                style={{
                  width: step.w,
                  minWidth: step.minW,
                  background: step.bg,
                  color: step.color,
                  border: step.border,
                }}
              >
                <div className={styles.funnelPillLabel}>{step.label}</div>
                <div className={styles.funnelPillSub} style={{ opacity: step.subOpacity }}>
                  {step.sub}
                </div>
              </div>
            ))}
          </div>
          <p className={styles.funnelCaption}>
            Thousands of daily entries, distilled upward into a single throughline.
          </p>
        </div>
      </section>

      <section id="contact" className={styles.cta}>
        <h2 className={styles.ctaH2}>
          I design systems that help people do great things — and stay whole doing them.
        </h2>
        <p className={styles.ctaSub}>
          See the seven axes in motion, all the way down to the current hour.
        </p>
        <div className={styles.ctaBtns}>
          <Link to="/demo" className={styles.btnPrimary}>Try the live demo</Link>
          <Link to="/contact" className={styles.btnSecondary}>Get in touch</Link>
        </div>
        <div className={styles.ctaPills}>
          {AXIS_COLORS.map((color) => (
            <span key={color} style={{ background: color }} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Portfolio;
