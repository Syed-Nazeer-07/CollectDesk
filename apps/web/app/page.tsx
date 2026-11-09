import type {Metadata} from 'next';
import Link from 'next/link';
import {
  ArrowRight,ArrowUpRight,BriefcaseBusiness,Building2,CheckCircle2,
  ClipboardCheck,FileText,FolderKanban,LockKeyhole,ShieldCheck,
  TrendingUp,UsersRound,Wallet
} from 'lucide-react';

export const metadata:Metadata={
  title:'CollectDesk | Commercial Collections Case Management',
  description:'A clearer workspace for overdue invoice intake, case review, operator coordination, and verified recovery tracking. Explore CollectDesk and create a creditor workspace.'
};

const capabilities=[
  {icon:FileText,title:'Invoice case intake',copy:'Create draft cases, submit overdue invoices, and keep your case details organized.'},
  {icon:ClipboardCheck,title:'Structured case review',copy:'Track review decisions, requests for more information, and case status changes.'},
  {icon:UsersRound,title:'Coordinated operations',copy:'Assigned staff can follow case progress and share appropriate updates.'},
  {icon:Wallet,title:'Verified recovery tracking',copy:'Separate recorded receipts from verified recovery totals, including corrections.'}
];

const steps=[
  {number:'01',title:'Create your account',copy:'Register as a creditor using Google or an email address with verification.'},
  {number:'02',title:'Set up your company',copy:'Provide your company details during registration or after Google sign-in.'},
  {number:'03',title:'Start managing cases',copy:'Submit an invoice case, follow its review, and see progress in your workspace.'}
];

export default function LandingPage(){
  return <div className="cdl">
    <header className="cdl-header">
      <nav className="cdl-nav cdl-container" aria-label="Main navigation">
        <Link className="cdl-brand" href="/" aria-label="CollectDesk home">
          <span className="cdl-brand-icon"><BriefcaseBusiness size={22}/></span>
          <span>collect<span>desk</span></span>
        </Link>
        <div className="cdl-nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#access">Who it&apos;s for</a>
        </div>
        <div className="cdl-nav-actions">
          <Link className="cdl-signin" href="/login">Sign in</Link>
          <Link className="cdl-button cdl-button-primary cdl-nav-cta" href="/login?mode=signup">
            Get started <ArrowUpRight size={17}/>
          </Link>
        </div>
      </nav>
    </header>

    <main id="main-content">
      <section className="cdl-hero cdl-container" aria-labelledby="landing-title">
        <div className="cdl-hero-copy">
          <span className="cdl-kicker"><span className="cdl-kicker-dot"/> COMMERCIAL COLLECTIONS, SIMPLIFIED</span>
          <h1 id="landing-title">Every overdue invoice deserves <span>a clearer path forward.</span></h1>
          <p className="cdl-hero-description">
            One focused workspace to submit collection cases, coordinate reviews,
            and track verified progress from first submission to resolution.
          </p>
          <div className="cdl-hero-actions">
            <Link className="cdl-button cdl-button-primary cdl-button-large" href="/login?mode=signup">
              Create a creditor account <ArrowRight size={19}/>
            </Link>
            <a className="cdl-button cdl-button-secondary cdl-button-large" href="#how-it-works">
              See how it works <ArrowUpRight size={18}/>
            </a>
          </div>
          <div className="cdl-hero-assurance">
            <div><CheckCircle2 size={17}/> Clear case visibility</div>
            <div><CheckCircle2 size={17}/> Assigned access by role</div>
          </div>
          <p className="cdl-hero-legal"><ShieldCheck size={15}/> Product preview using sample data. Not for real invoices, debtor outreach, or payment collection.</p>
        </div>

        <div className="cdl-visual" aria-label="Illustrative CollectDesk workspace with sample cases and recovery metrics">
          <div className="cdl-visual-glow" aria-hidden="true"/>
          <div className="cdl-screen">
            <div className="cdl-screen-top">
              <span className="cdl-screen-dots" aria-hidden="true"><i/><i/><i/></span>
              <span>Workspace overview</span>
              <span className="cdl-screen-sample">ILLUSTRATIVE</span>
            </div>
            <div className="cdl-screen-inner">
              <div className="cdl-screen-greeting">
                <div><span className="cdl-screen-overline">CASE MANAGEMENT</span><h2>Stay on top of every case.</h2><p>One place for the work that matters.</p></div>
                <span className="cdl-screen-avatar"><BriefcaseBusiness size={20}/></span>
              </div>
              <div className="cdl-screen-stats">
                <div className="cdl-screen-stat"><span>Active cases <FolderKanban size={15}/></span><strong>08</strong><small>In progress</small></div>
                <div className="cdl-screen-stat"><span>Awaiting review <ClipboardCheck size={15}/></span><strong>03</strong><small>Needs attention</small></div>
                <div className="cdl-screen-stat"><span>Verified entries <CheckCircle2 size={15}/></span><strong>12</strong><small>Recorded in ledger</small></div>
              </div>
              <div className="cdl-screen-table">
                <div className="cdl-screen-table-heading"><strong>Recent cases</strong><span>Sample activity</span></div>
                <div className="cdl-screen-table-head"><span>CASE</span><span>STATUS</span><span>PROGRESS</span></div>
                <div className="cdl-screen-table-row"><span><b>CC-1048</b><small>Invoice INV-210</small></span><span className="cdl-pill cdl-pill-green">In progress</span><div className="cdl-progress"><i style={{width:'72%'}}/></div></div>
                <div className="cdl-screen-table-row"><span><b>CC-1049</b><small>Invoice INV-211</small></span><span className="cdl-pill cdl-pill-amber">In review</span><div className="cdl-progress"><i style={{width:'35%'}}/></div></div>
                <div className="cdl-screen-table-row"><span><b>CC-1050</b><small>Invoice INV-212</small></span><span className="cdl-pill cdl-pill-slate">Submitted</span><div className="cdl-progress"><i style={{width:'18%'}}/></div></div>
              </div>
            </div>
          </div>
          <div className="cdl-float-card"><span><TrendingUp size={17}/></span><div><strong>Progress you can see</strong><small>From intake to verified recovery</small></div></div>
        </div>
      </section>

      <section id="features" className="cdl-features cdl-section" aria-labelledby="features-title">
        <div className="cdl-container">
          <div className="cdl-section-heading">
            <span className="cdl-section-kicker">THE WORKSPACE</span>
            <h2 id="features-title">All the moving parts, <span>finally in one place.</span></h2>
            <p>Less back-and-forth. More clarity across submissions, decisions, and case activity.</p>
          </div>
          <div className="cdl-feature-grid">
            {capabilities.map(item=>{
              const Icon=item.icon;
              return <article className="cdl-feature" key={item.title}>
                <span className="cdl-feature-icon"><Icon size={22}/></span>
                <h3>{item.title}</h3><p>{item.copy}</p>
              </article>;
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="cdl-how cdl-section" aria-labelledby="how-title">
        <div className="cdl-container">
          <div className="cdl-section-heading">
            <span className="cdl-section-kicker">GETTING STARTED</span>
            <h2 id="how-title">From first sign-in to <span>your first case.</span></h2>
            <p>Customer onboarding is designed around three straightforward steps.</p>
          </div>
          <div className="cdl-steps">
            {steps.map(step=><div className="cdl-step" key={step.number}>
              <span className="cdl-step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </div>)}
          </div>
          <div className="cdl-how-action">
            <Link href="/login?mode=signup" className="cdl-text-link">Begin customer onboarding <ArrowRight size={18}/></Link>
          </div>
        </div>
      </section>

      <section id="access" className="cdl-access cdl-section" aria-labelledby="access-title">
        <div className="cdl-container cdl-access-layout">
          <div className="cdl-access-copy">
            <span className="cdl-section-kicker">BUILT FOR COLLABORATION</span>
            <h2 id="access-title">The right workspace, for <span>the right people.</span></h2>
            <p>Your account determines your permissions, so teams can collaborate without manually choosing or switching roles at sign-in.</p>
            <div className="cdl-access-note"><LockKeyhole size={18}/><span>Public registration creates creditor accounts only. Administrator and operator access must be provisioned by authorized staff.</span></div>
          </div>
          <div className="cdl-access-cards">
            <div><span><Building2 size={20}/></span><div><h3>Creditor</h3><p>Submit and track cases for your company.</p></div></div>
            <div><span><ShieldCheck size={20}/></span><div><h3>Administrator</h3><p>Review cases, assign operators, and verify receipts.</p></div></div>
            <div><span><UsersRound size={20}/></span><div><h3>Case operator</h3><p>Follow assigned cases and record progress.</p></div></div>
          </div>
        </div>
      </section>

      <section className="cdl-bottom cdl-container" aria-labelledby="bottom-title">
        <div className="cdl-bottom-content">
          <div><span className="cdl-bottom-kicker">READY TO GET ORGANIZED?</span>
            <h2 id="bottom-title">Start with a clearer workflow.</h2>
            <p>Create your creditor workspace and discover how CollectDesk connects the pieces.</p>
          </div>
          <Link href="/login?mode=signup" className="cdl-button cdl-button-light">Create your account <ArrowRight size={18}/></Link>
        </div>
      </section>
    </main>

    <footer className="cdl-footer">
      <div className="cdl-container cdl-footer-inner">
        <div><span className="cdl-footer-brand">collect<span>desk</span></span><p>Commercial collections case management.</p></div>
        <div className="cdl-footer-links"><a href="#features">Features</a><a href="#how-it-works">Getting started</a><Link href="/login">Sign in</Link></div>
        <p className="cdl-footer-note">© 2026 CollectDesk · Preview for fictional data only. No real payments are processed.</p>
      </div>
    </footer>
  </div>;
}
