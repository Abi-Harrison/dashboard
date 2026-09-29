import React from 'react';
import { Link } from 'react-router-dom';
import styles from '@/pages/Welcome/Welcome.module.css';

const Welcome = () => {
  return (
    <div className={styles.welcomeContainer}>
      <div className={styles.contentCard}>
        <h1 className={styles.headline}>Gearshift</h1>
        
        <p className={styles.subheadline}>
          A planning system for keeping ambitious work in motion, with the rest of a life still in view.
        </p>

        <div className={styles.textBlock}>
          <p>
            Gearshift holds long-range goals, the current hour, and reflection in one place. The work is product and systems design: decide what to pay attention to, give it a structure, then watch whether the structure actually helps.
          </p>
        </div>

        <ul className={styles.criteriaList}>
          <li>
            <strong>Discovery into information architecture.</strong> Life domains became seven axes, and a zoom from a long view down to the current hour, so daily work stays attached to what it is for.
          </li>
          <li>
            <strong>An AI agent loop.</strong> The Advisor proposes a structured record. Gearshift shows the proposal and waits for a confirm before a save, corpus log, or learning is stored.
          </li>
          <li>
            <strong>Instrumentation.</strong> Pomodoro and break logs make recovery visible, so the work-to-rest pattern can be adjusted instead of guessed.
          </li>
        </ul>

        <section className={styles.caseStudy}>
          <h2>How Advisor markers work</h2>
          <p>
            The Advisor proposes records through a small contract the interface can parse: a save, a corpus log, or a learning, with a fixed shape (axis, themes, voice markers, state, significance). Gearshift strips the marker out of the reply, shows the proposed record, and commits after a confirm. A query works the same way in the other direction: the agent asks, the product runs the lookup, and the result comes back into the conversation. The agent proposes; the product surface decides what is stored.
          </p>
        </section>

        <div className={styles.buttonContainer}>
          <Link to="/demo" className={styles.primaryButton}>Open the demo</Link>
          <Link to="/concepts" className={styles.secondaryButton}>Guided tour</Link>
          <Link to="/login" className={styles.secondaryButton}>Personal login</Link>
        </div>
        <p className={styles.shareNote}>The demo uses sample data and does not require login.</p>
      </div>
    </div>
  );
};

export default Welcome;