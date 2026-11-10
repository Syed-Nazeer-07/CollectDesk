import type {Metadata} from 'next';
import Link from 'next/link';
import LandingEffects from '../components/LandingEffects';
import {ThemeToggle} from '../components/ThemeProvider';
import './landing.css';

export const metadata:Metadata={
  title:'CollectDesk | Commercial Collections Case Management',
  description:'A clearer workspace for overdue invoice intake, case review, operator coordination, and verified recovery tracking. Explore CollectDesk and create a creditor workspace.'
};

/* Inline icon sprite (Lucide-style paths) keeps the page free of extra dependencies. */
function Sprite(){
  return <svg width={0} height={0} style={{position:'absolute'}} aria-hidden="true" focusable="false">
    <defs>
      <symbol id="lp-i-brief" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></symbol>
      <symbol id="lp-i-up" viewBox="0 0 24 24"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></symbol>
      <symbol id="lp-i-right" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></symbol>
      <symbol id="lp-i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></symbol>
      <symbol id="lp-i-tick" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
      <symbol id="lp-i-shield" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></symbol>
      <symbol id="lp-i-users" viewBox="0 0 24 24"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></symbol>
      <symbol id="lp-i-clip" viewBox="0 0 24 24"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></symbol>
      <symbol id="lp-i-lock" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2"/><circle cx="12" cy="16" r="1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></symbol>
      <symbol id="lp-i-plus" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5v14"/></symbol>
      <symbol id="lp-i-folder" viewBox="0 0 24 24"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></symbol>
    </defs>
  </svg>;
}
function Ic({n,size}:{n:string;size?:number}){
  return <svg className="lp-i" aria-hidden="true" focusable="false" style={size?{fontSize:size}:undefined}><use href={`#lp-i-${n}`}/></svg>;
}
function Brand({footer}:{footer?:boolean}){
  return <Link className="lp-brand" href="/" aria-label="CollectDesk home" style={footer?{padding:0,height:'auto'}:undefined}>
    <span className="lp-brand-mark"><Ic n="brief"/></span><span className="lp-bn">collect<i>desk</i></span>
  </Link>;
}

type Row=[label:string,value:string,valueClass?:string,rowClass?:string];
type Stage={title:string;copy:string;who:string;icon:string;code:string;pill:string;pillTone:string;heading:string;sub:string;rows:Row[]};

/* Real CollectDesk lifecycle: Draft → Submitted → Review → Assigned → Progress → Reconciliation → Closed. All figures are sample data. */
const stages:Stage[]=[
  {title:'Draft',copy:'Create a case from an overdue invoice. Edit the details until they are right.',who:'Creditor',icon:'brief',code:'CC-1050 · DRAFT',pill:'Draft',pillTone:'s',heading:'Prepare the case',sub:'Fields stay editable until you submit.',
    rows:[['Invoice','INV-212'],['Amount due','₹1,80,000'],['Days overdue','47'],['Next action','Submit for review']]},
  {title:'Submitted',copy:'Send the case to the administrators. It waits in the queue with a clear status.',who:'Creditor',icon:'brief',code:'CC-1050 · SUBMITTED',pill:'Submitted',pillTone:'s',heading:'Sent to administrators',sub:'The creditor can follow progress from here.',
    rows:[['Submitted by','Creditor'],['Queue position','3'],['Visible to creditor','Yes','ok'],['Next action','Administrator review']]},
  {title:'Review',copy:'An administrator approves the case or asks for more information.',who:'Administrator',icon:'shield',code:'CC-1049 · REVIEW',pill:'In review',pillTone:'a',heading:'Review the request',sub:'Approve it, or ask the creditor for more.',
    rows:[['Invoice','INV-211'],['Documents check','Complete','ok'],['Decision','Approve · Request info'],['Next action','Assign an operator']]},
  {title:'Assigned',copy:'An operator takes ownership, so every case has one named person behind it.',who:'Administrator',icon:'shield',code:'CC-1049 · ASSIGNED',pill:'Assigned',pillTone:'a',heading:'One named owner',sub:'Operators only see the cases assigned to them.',
    rows:[['Assigned to','Case operator'],['Assigned by','Administrator'],['Creditor notified','Yes','ok'],['Next action','Begin work']]},
  {title:'Progress',copy:'The operator logs activity. Public updates reach the creditor, internal notes stay internal.',who:'Case operator',icon:'users',code:'CC-1048 · PROGRESS',pill:'In progress',pillTone:'g',heading:'Activity, by audience',sub:'Choose what the creditor sees and what stays internal.',
    rows:[['Public update','Payment plan proposed'],['Internal note','Debtor asked for 30 days'],['Progress','72%'],['Next action','Record receipt']]},
  {title:'Reconciliation',copy:'Receipts are verified, rejected, or reversed. Only verified ones move the total.',who:'Administrator',icon:'shield',code:'CC-1048 · RECONCILIATION',pill:'Verifying',pillTone:'g',heading:'Receipts, checked',sub:'The recovery total counts verified entries only.',
    rows:[['Receipt R-01','+ ₹40,000 · verified','ok'],['Receipt R-02','₹25,000 · pending','dim'],['Reversal R-03','− ₹5,000','neg'],['Net verified recovery','₹35,000','','total']]},
  {title:'Closed',copy:'The case closes with its full ledger intact. Closing does not mean the invoice was paid in full.',who:'Administrator',icon:'clip',code:'CC-1031 · CLOSED',pill:'Closed',pillTone:'s',heading:'Closed with the full record',sub:'Outstanding balance and recovery stay separate.',
    rows:[['Invoice amount','₹2,40,000'],['Net verified recovery','₹1,95,000','ok'],['Balance not recovered','₹45,000','neg'],['Closed on','Full ledger kept']]}
];

const orbitChips=[
  {name:'Draft',color:'#9aa3b2'},{name:'Submitted',color:'var(--sky)'},{name:'Review',color:'var(--amber)'},{name:'Assigned',color:'var(--rose)'},
  {name:'Progress',color:'var(--mint)'},{name:'Reconciliation',color:'var(--accent)'},{name:'Closed',color:'var(--fg)'}
];

const capabilities=[
  {icon:'clip',title:'Invoice case intake',copy:'Create draft cases, submit overdue invoices, and keep your case details organized.'},
  {icon:'shield',title:'Structured case review',copy:'Track review decisions, requests for more information, and case status changes.'},
  {icon:'users',title:'Coordinated operations',copy:'Assigned staff can follow case progress and share appropriate updates.'},
  {icon:'tick',title:'Verified recovery tracking',copy:'Separate recorded receipts from verified recovery totals, including corrections.'}
];

const steps=[
  {number:'01',title:'Create your account',copy:'Sign up with an email address or Google login to set up your workspace.'},
  {number:'02',title:'Submit an overdue invoice',copy:'Enter debtor and invoice details, confirm dates, and submit the claim for administrative review.'},
  {number:'03',title:'Follow verified progress',copy:'Monitor case milestones, public updates, and verified recovery receipts from one dashboard.'}
];

const roles=[
  {icon:'brief',title:'Creditor',copy:'Submit and track cases for your company.',tags:['Draft invoices','Submit cases','Follow public progress']},
  {icon:'shield',title:'Administrator',copy:'Review cases, assign operators, and verify receipts.',tags:['Review requests','Assign operators','Verify or reverse receipts']},
  {icon:'users',title:'Case operator',copy:'Follow assigned cases and record progress.',tags:['Assigned cases only','Public updates','Internal notes']}
];

const faqs=[
  {q:'Does CollectDesk collect money or contact debtors?',a:'No. It is a case management workspace. It does not move money, message debtors, or process real invoices.'},
  {q:'What counts toward recovery?',a:'Only receipts an administrator has verified. Pending receipts are shown but not counted. A reversal is a separate correction entry, so history is never rewritten.'},
  {q:'Who can create an account?',a:'Public registration creates creditor accounts, through Google or a verified email address. Administrator and operator accounts are provisioned separately.'},
  {q:'Does a closed case mean the invoice was paid?',a:'No. Closing ends the case. The ledger still shows exactly how much was verified and how much remains outstanding.'},
  {q:'Is the data on this page real?',a:'No. Every figure, case number, and name here is illustrative sample data.'}
];

const statement='We take overdue invoices from intake to review, assignment, and verified recovery, so every update has an owner and every number has a source.'.split(' ');

function Ledger({rows}:{rows:Row[]}){
  return <div className="lp-kv">{rows.map(([l,v,vc,rc])=><div key={l} className={rc?`lp-${rc}`:undefined}><span>{l}</span><b className={vc?`lp-${vc}`:undefined}>{v}</b></div>)}</div>;
}

export default function LandingPage(){
  return <div className="lp">
    <Sprite/>
    <LandingEffects/>

    <header className="lp-nav">
      <nav className="lp-nav-pill" aria-label="Main navigation">
        <Brand/>
        <a className="lp-nav-link" href="#features">Features</a>
        <a className="lp-nav-link" href="#stages">Lifecycle</a>
        <a className="lp-nav-link" href="#roles">Roles</a>
        <a className="lp-nav-link" href="#faq">FAQ</a>
        <ThemeToggle className="lp-theme-toggle" />
        <Link className="lp-btn lp-btn-ghost" href="/login">Sign in</Link>
        <Link className="lp-btn lp-btn-accent" href="/login?mode=signup">Get started <Ic n="up"/></Link>
      </nav>
    </header>

    <main id="main-content">
      {/* HERO */}
      <section className="lp-hero" aria-labelledby="landing-title">
        <div className="lp-wrap">
          <span className="lp-pill"><span className="lp-dot"/>Commercial collections case management</span>
          <h1 id="landing-title">Every overdue invoice deserves <em>a clearer path forward.</em></h1>
          <p className="lp-hero-sub">One workspace to submit collection cases, coordinate reviews, and track verified recovery from first submission to resolution.</p>
          <div className="lp-hero-cta">
            <Link className="lp-btn lp-btn-accent lp-btn-lg" href="/login?mode=signup">Create a creditor account <Ic n="right"/></Link>
            <a className="lp-btn lp-btn-ghost lp-btn-lg" href="#stages">See how it works <Ic n="up"/></a>
          </div>
          <div className="lp-hero-assure">
            <span><Ic n="check"/>Clear case visibility</span>
            <span><Ic n="check"/>Access assigned by role</span>
            <span><Ic n="check"/>Verified-only recovery totals</span>
          </div>

          <div className="lp-hero-stage" aria-label="Illustrative CollectDesk workspace with sample cases">
            <div className="lp-float lp-f1 lp-f-orange"><div className="lp-badge-orb lp-orb-orange"><Ic n="brief"/></div></div>
            <div className="lp-float lp-f2 lp-f-bars lp-gcard"><small>Active cases</small><strong>08</strong><div className="lp-bars" aria-hidden="true"><i/><i/><i/><i/><i/></div></div>
            <div className="lp-float lp-f3 lp-f-line lp-gcard">
              <small>Verified recovery</small><strong>₹3.5L</strong>
              <svg className="lp-spark" viewBox="0 0 200 58" preserveAspectRatio="none" aria-hidden="true">
                <defs><linearGradient id="lp-sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff6a2b" stopOpacity=".45"/><stop offset="1" stopColor="#ff6a2b" stopOpacity="0"/></linearGradient></defs>
                <path d="M0 48 L28 42 L56 46 L84 30 L112 34 L140 18 L170 22 L200 6 L200 58 L0 58Z" fill="url(#lp-sg)"/>
                <path d="M0 48 L28 42 L56 46 L84 30 L112 34 L140 18 L170 22 L200 6" fill="none" stroke="#ff6a2b" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"/>
                <circle cx="200" cy="6" r="4" fill="#ff6a2b"/>
              </svg>
              <span className="lp-tag-sample">SAMPLE</span>
            </div>
            <div className="lp-float lp-f4 lp-f-sky"><div className="lp-badge-orb lp-orb-sky"><Ic n="shield"/>Verified</div></div>

            <div className="lp-dash">
              <div className="lp-dash-top"><span className="lp-dots" aria-hidden="true"><i/><i/><i/></span><span>Workspace overview</span><span className="lp-sample">ILLUSTRATIVE</span></div>
              <div className="lp-dash-body">
                <span className="lp-over">CASE MANAGEMENT</span>
                <h2>Stay on top of every case.</h2>
                <div className="lp-dstats">
                  <div className="lp-dstat"><span>Active cases <Ic n="folder"/></span><strong>08</strong><small>In progress</small></div>
                  <div className="lp-dstat"><span>Awaiting review <Ic n="clip"/></span><strong>03</strong><small>Needs attention</small></div>
                  <div className="lp-dstat"><span>Verified entries <Ic n="check"/></span><strong>12</strong><small>Recorded in ledger</small></div>
                </div>
                <div className="lp-drows">
                  <div className="lp-drow"><span>CASE</span><span>STATUS</span><span>PROGRESS</span></div>
                  <div className="lp-drow"><span><b>CC-1048</b><small>Invoice INV-210</small></span><span className="lp-st lp-st-g">In progress</span><div className="lp-meter"><i style={{width:'72%'}}/></div></div>
                  <div className="lp-drow"><span><b>CC-1049</b><small>Invoice INV-211</small></span><span className="lp-st lp-st-a">In review</span><div className="lp-meter"><i style={{width:'35%'}}/></div></div>
                  <div className="lp-drow"><span><b>CC-1050</b><small>Invoice INV-212</small></span><span className="lp-st lp-st-s">Submitted</span><div className="lp-meter"><i style={{width:'18%'}}/></div></div>
                </div>
              </div>
            </div>
          </div>
          <p className="lp-legal"><Ic n="shield" size={15}/>Product preview using sample data. Not for real invoices, debtor outreach, or payment collection.</p>
        </div>
      </section>

      {/* ORBIT */}
      <section className="lp-band lp-orbit-band" aria-labelledby="orbit-title">
        <div className="lp-wrap">
          <span className="lp-kicker">The ledger rule</span>
          <h2 id="orbit-title">Introducing verified recovery.</h2>
          <p className="lp-lead">Seven stages carry every case from draft to closure. Only receipts an administrator has verified ever reach your recovery total.</p>
          <div className="lp-orbit" id="orbit" role="img" aria-label="The seven case stages orbiting a verified recovery coin">
            <div className="lp-orbit-ring" aria-hidden="true"/>
            <div className="lp-coin-shadow" aria-hidden="true"/>
            <div className="lp-coin" aria-hidden="true"><div className="lp-coin-face"><Ic n="tick"/></div></div>
            {orbitChips.map(c=><span key={c.name} className="lp-chip" style={{'--c':c.color} as React.CSSProperties}>{c.name}</span>)}
          </div>
          <div className="lp-orbit-note">
            <span><Ic n="check"/>Pending receipts never count</span>
            <span><Ic n="check"/>Reversals are separate entries</span>
            <span><Ic n="check"/>Closing is not full payment</span>
          </div>
        </div>
      </section>

      {/* STATEMENT + STATS */}
      <section className="lp-band lp-statement" aria-label="What CollectDesk does">
        <div className="lp-wrap">
          <p id="statement">{statement.map((w,i)=><span key={i}><span className="lp-w">{w}</span>{' '}</span>)}</p>
          <div className="lp-stats">
            <div className="lp-stat lp-rv"><span className="lp-kicker lp-k">Lifecycle</span><strong><span data-count="7">7</span></strong><p>case stages, from draft to closed, with a status on every step.</p></div>
            <div className="lp-stat lp-rv" style={{'--d':'.1s'} as React.CSSProperties}><span className="lp-kicker lp-k">Workspaces</span><strong><span data-count="3">3</span></strong><p>role-based views for creditors, administrators, and case operators.</p></div>
            <div className="lp-stat lp-rv" style={{'--d':'.2s'} as React.CSSProperties}><span className="lp-kicker lp-k">Recovery totals</span><strong><span data-count="100">100</span><sup>%</sup></strong><p>built from verified receipts only. Pending ones are listed, never counted.</p></div>
          </div>
        </div>
      </section>

      {/* CORE CAPABILITIES */}
      <section className="lp-band" id="features" style={{paddingTop:0}} aria-labelledby="features-title">
        <div className="lp-wrap">
          <div className="lp-stages-head">
            <span className="lp-kicker">Core platform</span>
            <h2 id="features-title">All moving parts, in one workspace.</h2>
            <p>Less back-and-forth. More clarity across submissions, decisions, and case activity.</p>
          </div>
          <div className="cdl-feature-grid">
            {capabilities.map(item=>(
              <article className="cdl-feature" key={item.title}>
                <span className="cdl-feature-icon"><Ic n={item.icon} size={22}/></span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CUSTOMER ONBOARDING */}
      <section className="lp-band" id="how-it-works" style={{paddingTop:0}} aria-labelledby="how-title">
        <div className="lp-wrap">
          <div className="lp-stages-head">
            <span className="lp-kicker">Getting started</span>
            <h2 id="how-title">From first sign-in to your first case.</h2>
            <p>Customer onboarding is designed around three straightforward steps.</p>
          </div>
          <div className="cdl-steps">
            {steps.map(step=>(
              <div className="cdl-step" key={step.number}>
                <span className="cdl-step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STAGES */}
      <section className="lp-band" id="stages" style={{paddingTop:0}} aria-labelledby="stages-title">
        <div className="lp-wrap">
          <div className="lp-stages-head">
            <span className="lp-kicker">How a case moves</span>
            <h2 id="stages-title">From first draft to verified recovery.</h2>
            <p>Scroll through the lifecycle. Each stage shows who acts and what the creditor sees.</p>
          </div>
          <div className="lp-stages">
            <div className="lp-steps">
              {stages.map((s,i)=><div key={s.title} className={i===0?'lp-step lp-on':'lp-step'} data-i={i}>
                <span className="lp-no">STAGE {i+1} OF {stages.length}</span><h3>{s.title}</h3><p>{s.copy}</p>
                <span className="lp-who"><Ic n={s.icon}/>{s.who}</span>
              </div>)}
            </div>
            <div className="lp-visual" aria-live="polite">
              {stages.map((s,i)=><div key={s.title} className={i===0?'lp-panel lp-on':'lp-panel'} data-i={i}>
                <div className="lp-panel-top"><b>{s.code}</b><span className={`st st-${s.pillTone}`.split(' ').map(c=>'lp-'+c).join(' ')}>{s.pill}</span></div>
                <h4>{s.heading}</h4><p>{s.sub}</p>
                <div className="lp-track" aria-hidden="true">{stages.map((_,j)=><i key={j} className={j<=i?'lp-f':undefined}/>)}</div>
                <Ledger rows={s.rows}/>
              </div>)}
            </div>
          </div>
        </div>
      </section>

      {/* ROLES (cream) */}
      <section className="lp-paper lp-band" id="roles" aria-labelledby="roles-title">
        <div className="lp-wrap">
          <span className="lp-kicker">Built for collaboration</span>
          <h2 id="roles-title">The right workspace for the right people.</h2>
          <p className="lp-lead">Your account sets your permissions, so nobody picks or switches roles at sign-in.</p>
          <div className="lp-paper-grid">
            <div>
              <div className="lp-roles">
                {roles.map(r=><div key={r.title} className="lp-role lp-rv">
                  <span className="lp-role-ico"><Ic n={r.icon}/></span>
                  <div><h3>{r.title}</h3><p>{r.copy}</p><ul>{r.tags.map(t=><li key={t}>{t}</li>)}</ul></div>
                </div>)}
              </div>
              <div className="lp-note"><Ic n="lock"/><span>Public registration creates creditor accounts only. Administrator and operator access is set up by authorized staff.</span></div>
            </div>
            <aside className="lp-ledger lp-rv" aria-label="Sample recovery ledger">
              <div className="lp-ledger-head"><span>CC-1048 · RECOVERY LEDGER</span><span className="lp-sample">SAMPLE</span></div>
              <h3>Recorded is not recovered.</h3>
              <p>Every receipt is listed. Only verified ones count.</p>
              <Ledger rows={[['R-01 · Receipt','+ ₹40,000','ok'],['R-02 · Pending verification','₹25,000','dim'],['R-03 · Reversal','− ₹5,000','neg'],['Net verified recovery','₹35,000','','total']]}/>
            </aside>
          </div>
        </div>
      </section>

      {/* FAQ + CTA */}
      <section className="lp-band" id="faq" aria-labelledby="faq-title">
        <div className="lp-wrap">
          <div className="lp-faq-grid">
            <div><span className="lp-kicker">Questions</span><h2 id="faq-title">Before you sign up.</h2><p className="lp-lead">CollectDesk is a sample-data preview. Here is what it does and does not do.</p></div>
            <div>
              {faqs.map((f,i)=><details key={f.q} open={i===0}><summary>{f.q}<span className="lp-pl"><Ic n="plus"/></span></summary><p>{f.a}</p></details>)}
            </div>
          </div>
          <div className="lp-cta">
            <div><h2>Start with a clearer workflow.</h2><p>Create your creditor workspace and see how CollectDesk connects the pieces.</p></div>
            <div className="lp-cta-actions">
              <Link className="lp-btn lp-btn-accent lp-btn-lg" href="/login?mode=signup">Create your account <Ic n="right"/></Link>
              <Link className="lp-btn lp-btn-ghost lp-btn-lg" href="/login">Sign in</Link>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer className="lp-foot">
      <div className="lp-wrap">
        <div className="lp-foot-cols">
          <div><Brand footer/><p>Commercial collections case management for creditors, administrators, and operators.</p></div>
          <div><h5>Product</h5><a href="#stages">How it works</a><a href="#roles">Roles</a><a href="#faq">FAQ</a></div>
          <div><h5>Access</h5><Link href="/login?mode=signup">Create account</Link><Link href="/login">Sign in</Link><Link href="/forgot-password">Reset password</Link></div>
          <div><h5>Project</h5><a href="https://github.com/Syed-Nazeer-07/CollectDesk" target="_blank" rel="noopener noreferrer">GitHub</a><a href="/api/health">Service health</a></div>
        </div>
        <div className="lp-mega" aria-hidden="true">collect<i>desk</i></div>
        <div className="lp-foot-note"><span>© 2026 CollectDesk · Commercial Collections MVP</span><span>Sample data only. No real payments are processed.</span></div>
      </div>
    </footer>
  </div>;
}
