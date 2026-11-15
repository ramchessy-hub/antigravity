const { app, BrowserWindow, screen } = require('electron');
const { exec } = require('child_process');

let mainWindow = null;
let blockerWindow = null;
let checkInterval = null;
let scrollInterval = null;

const PAGE_URL = 'https://stakecruncher-balanc-3s23.bolt.host/';

const REMOTE_PROCESS_PATTERNS = [
  'AnyDesk.exe',
  'TeamViewer.exe',
  'tvnserver.exe',
  'vncserver.exe',
  'vncviewer.exe',
  'mstsc.exe',
  'rustdesk.exe',
  'sunloginclient.exe',
  'ToDesk.exe',
  'GoToMyHost.exe',
  'supremo.exe',
  'splashtop.exe',
  'NVIDIA Share.exe',
  'obs64.exe',
  'obs32.exe',
];

function buildTasklistCommand() {
  const imageFilters = REMOTE_PROCESS_PATTERNS
    .map(p => `"IMAGENAME eq ${p}"`)
    .join(' ');
  return `tasklist /FI ${imageFilters} /FO CSV /NH`;
}

function isRemoteActive(callback) {
  if (process.platform !== 'win32') {
    callback(false);
    return;
  }
  exec(buildTasklistCommand(), (err, stdout) => {
    if (err || !stdout) {
      callback(false);
      return;
    }
    const active = REMOTE_PROCESS_PATTERNS.some(p =>
      stdout.toLowerCase().includes(p.toLowerCase().replace('.exe', ''))
    );
    callback(active);
  });
}

function createMainWindow() {
  const { bounds } = screen.getPrimaryDisplay();
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(PAGE_URL);
  mainWindow.setContentProtection(true);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const DECOY_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>washing machine - Google Search</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Google Sans,Roboto,arial,sans-serif;background:#fff;color:#202124;font-size:14px}
a{color:#1a0dab;text-decoration:none}
a:hover{text-decoration:underline}
.g-header{display:flex;align-items:center;gap:20px;padding:12px 32px;border-bottom:1px solid #ebebeb}
.g-logo{display:flex;align-items:center;gap:6px;font-size:22px}
.g-logo span:nth-child(1){color:#4285f4;font-weight:400;font-family:Product Sans,Google Sans,arial}
.g-logo span:nth-child(2){color:#ea4335;font-weight:400}
.g-logo span:nth-child(3){color:#fbbc04;font-weight:400}
.g-logo span:nth-child(4){color:#4285f4;font-weight:400}
.g-logo span:nth-child(5){color:#34a853;font-weight:400}
.g-search-box{flex:1;max-width:580px;height:44px;border:1px solid #dfe1e5;border-radius:24px;display:flex;align-items:center;padding:0 16px;box-shadow:0 1px 6px rgba(32,33,36,.08)}
.g-search-box input{flex:1;border:none;outline:none;font-size:16px;color:#202124}
.g-search-icon{width:20px;height:20px;color:#9aa0a6;margin-right:8px}
.g-tools{display:flex;gap:8px;align-items:center}
.g-tools .g-icon{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer}
.g-tools .g-icon:hover{background:#f1f3f4}
.g-tools .g-avatar{width:32px;height:32px;border-radius:50%;background:#1a73e8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600}
.g-tabs{display:flex;gap:4px;padding:0 32px;border-bottom:1px solid #ebebeb}
.g-tab{padding:14px 16px;color:#5f6368;font-size:13px;border-bottom:3px solid transparent;cursor:pointer}
.g-tab.active{color:#1a73e8;border-bottom-color:#1a73e8;font-weight:600}
.g-tab:hover{color:#202124}
.g-results-meta{padding:8px 32px 12px;color:#70757a;font-size:13px}
.g-main{display:flex;gap:24px;padding:0 32px;max-width:1100px}
.g-results{flex:1;max-width:652px}
.g-shopping{width:320px;flex-shrink:0}
.g-result{margin-bottom:28px}
.g-result-url{color:#006621;font-size:13px;line-height:1.3}
.g-result-title{font-size:20px;line-height:1.3;margin-top:1px}
.g-result-title a{color:#1a0dab}
.g-result-snippet{color:#4d5156;line-height:1.58;margin-top:4px;font-size:14px}
.g-result-links{display:flex;gap:24px;margin-top:6px}
.g-result-links a{color:#1a0dab;font-size:13px}
.g-shopping-card{background:#fff;border:1px solid #dadce0;border-radius:8px;margin-bottom:16px;overflow:hidden}
.g-shopping-card img{width:100%;height:180px;object-fit:cover;background:#f8f9fa}
.g-shopping-info{padding:12px 14px}
.g-shopping-title{font-size:14px;color:#202124;line-height:1.4;margin-bottom:6px}
.g-shopping-price{font-size:18px;font-weight:600;color:#e8710a}
.g-shopping-store{font-size:12px;color:#5f6368;margin-top:4px}
.g-shopping-rating{color:#fbbc04;font-size:13px;margin-top:2px}
.g-people-ask{border:1px solid #dadce0;border-radius:8px;margin:24px 0;overflow:hidden}
.g-people-ask-title{padding:16px 20px;font-size:18px;font-weight:600;border-bottom:1px solid #dadce0}
.g-people-ask-item{padding:14px 20px;font-size:15px;color:#202124;border-bottom:1px solid #ebebeb;cursor:pointer;display:flex;justify-content:space-between;align-items:center}
.g-people-ask-item:hover{background:#f8f9fa}
.g-people-ask-item:last-child{border-bottom:none}
.g-people-ask-icon{color:#5f6368;font-size:20px}
.g-related{border-top:1px solid #ebebeb;padding:20px 0;margin-top:20px}
.g-related-title{font-size:18px;font-weight:600;margin-bottom:12px}
.g-related-links{display:flex;flex-wrap:wrap;gap:8px}
.g-related-link{background:#f1f3f4;border-radius:20px;padding:8px 16px;font-size:14px;color:#1a0dab;cursor:pointer}
.g-related-link:hover{background:#e8eaed}
.g-footer{border-top:1px solid #ebebeb;padding:20px 32px;display:flex;justify-content:center;gap:24px}
.g-footer a{color:#70757a;font-size:13px}
</style></head><body>
<div class="g-header">
  <div class="g-logo">
    <span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span style="color:#4285f4">e</span>
  </div>
  <div class="g-search-box">
    <svg class="g-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    <input type="text" value="washing machine" readonly>
  </div>
  <div class="g-tools">
    <div class="g-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg></div>
    <div class="g-avatar">P</div>
  </div>
</div>
<div class="g-tabs">
  <div class="g-tab active">All</div>
  <div class="g-tab">Shopping</div>
  <div class="g-tab">Images</div>
  <div class="g-tab">Videos</div>
  <div class="g-tab">News</div>
  <div class="g-tab">Maps</div>
  <div class="g-tab">More</div>
</div>
<div class="g-results-meta">About 14,80,00,000 results (0.42 seconds)</div>
<div class="g-main">
  <div class="g-results">
    <div class="g-result">
      <div class="g-result-url">https://www.amazon.in &rsaquo; Washing Machines</div>
      <div class="g-result-title"><a href="#">Washing Machines: Buy Washing Machine Online at Best Prices ...</a></div>
      <div class="g-result-snippet">Shop for Washing Machines from top brands like LG, Samsung, Whirlpool, Bosch, IFB and more. Choose from fully automatic, semi-automatic, front load and top load washing machines. Free delivery and installation available across India.</div>
      <div class="g-result-links"><a>Front Load</a><a>Top Load</a><a>Semi-Automatic</a><a>Portable</a></div>
    </div>
    <div class="g-result">
      <div class="g-result-url">https://www.flipkart.com &rsaquo; home-appliances &rsaquo; washing-machines</div>
      <div class="g-result-title"><a href="#">Washing Machines - Buy Front Load, Top Load Washing Machines ...</a></div>
      <div class="g-result-snippet">Washing Machines - Shop for Washing Machines online at best prices in India. Choose from a wide range of Semi-Automatic &amp; Fully Automatic washing machines from top brands. Easy EMI options, no-cost EMI, and free delivery available.</div>
      <div class="g-result-links"><a>Fully Automatic</a><a>Price List</a><a>Offers</a></div>
    </div>
    <div class="g-result">
      <div class="g-result-url">https://www.lg.com &rsaquo; in &rsaquo; washing-machines</div>
      <div class="g-result-title"><a href="#">LG Washing Machines: Front Load, Top Load, Semi Automatic - LG India</a></div>
      <div class="g-result-snippet">Explore LG's range of washing machines featuring AI Direct Drive, TurboWash, and Steam Wash technology. Available in capacities from 6.5 kg to 12 kg. Energy efficient models with 5-star ratings and smart diagnosis features.</div>
      <div class="g-result-links"><a>Front Load</a><a>Top Load</a><a>Semi-Auto</a><a>Support</a></div>
    </div>
    <div class="g-result">
      <div class="g-result-url">https://www.samsung.com &rsaquo; in &rsaquo; home-appliances &rsaquo; washing-machines</div>
      <div class="g-result-title"><a href="#">Samsung Washing Machines | Fully Automatic, Semi-Automatic ...</a></div>
      <div class="g-result-snippet">Discover Samsung washing machines with EcoBubble technology, Digital Inverter Motor, and Hygiene Steam. Choose from top load, front load, and washer dryer combos. Available in 6kg to 12kg capacities with warranty up to 12 years on motor.</div>
      <div class="g-result-links"><a>Front Load</a><a>Top Load</a><a>Washer Dryer</a></div>
    </div>
    <div class="g-result">
      <div class="g-result-url">https://en.wikipedia.org &rsaquo; wiki &rsaquo; Washing_machine</div>
      <div class="g-result-title"><a href="#">Washing machine - Wikipedia</a></div>
      <div class="g-result-snippet">A washing machine is a home appliance used to wash laundry. The term is mostly applied to machines that use water as opposed to dry cleaning or ultrasonic cleaners. The user adds laundry detergent, which is sold in liquid or powder form, to the wash water. The first English patent under the category of washing machines was issued in 1691.</div>
      <div class="g-result-links"><a>History</a><a>Types</a><a>Mechanism</a></div>
    </div>
    <div class="g-result">
      <div class="g-result-url">https://www.bosch-home.in &rsaquo; washing-machines</div>
      <div class="g-result-title"><a href="#">Bosch Washing Machines | Front Load, Top Load - Bosch Home India</a></div>
      <div class="g-result-snippet">Bosch washing machines feature VarioDrum technology, AntiTangle wash, and EcoSilence Drive motor. Front load models with ActiveWater Plus for optimal water usage. Capacity ranges from 6.5 kg to 10 kg. 10-year warranty on motor.</div>
      <div class="g-result-links"><a>Front Load</a><a>Top Load</a><a>Accessories</a></div>
    </div>
    <div class="g-people-ask">
      <div class="g-people-ask-title">People also ask</div>
      <div class="g-people-ask-item"><span>Which washing machine is best for home use?</span><span class="g-people-ask-icon">&darr;</span></div>
      <div class="g-people-ask-item"><span>What is the difference between front load and top load washing machine?</span><span class="g-people-ask-icon">&darr;</span></div>
      <div class="g-people-ask-item"><span>How much does a good washing machine cost in India?</span><span class="g-people-ask-icon">&darr;</span></div>
      <div class="g-people-ask-item"><span>Which brand washing machine is most durable?</span><span class="g-people-ask-icon">&darr;</span></div>
      <div class="g-people-ask-item"><span>Is front load better than top load?</span><span class="g-people-ask-icon">&darr;</span></div>
    </div>
    <div class="g-result">
      <div class="g-result-url">https://www.ifbappliances.com &rsaquo; washing-machines</div>
      <div class="g-result-title"><a href="#">IFB Washing Machines | Front Load, Top Load, Washer Dryer - IFB</a></div>
      <div class="g-result-snippet">IFB washing machines come with Aqua Energie, Cradle Wash for delicate fabrics, and 3D Wash System. Available in 6.5 kg to 12 kg. Features include 2D Shower, Ball Valve Technology, and auto imbalance sensing. Free 4-year comprehensive warranty.</div>
      <div class="g-result-links"><a>Front Load</a><a>Top Load</a><a>Washer Dryer</a><a>Service</a></div>
    </div>
    <div class="g-result">
      <div class="g-result-url">https://www.whirlpoolindia.com &rsaquo; washing-machines</div>
      <div class="g-result-title"><a href="#">Whirlpool Washing Machines | Semi Automatic, Fully Automatic</a></div>
      <div class="g-result-snippet">Whirlpool washing machines feature 6th Sense Technology, ZPF filling system, and Hard Water Wash. Top load and semi-automatic models available from 7 kg to 9.5 kg. Built-in heater and wash programs for all fabric types.</div>
      <div class="g-result-links"><a>Top Load</a><a>Semi-Auto</a><a>Offers</a></div>
    </div>
    <div class="g-related">
      <div class="g-related-title">Related searches</div>
      <div class="g-related-links">
        <span class="g-related-link">best washing machine in india</span>
        <span class="g-related-link">front load washing machine</span>
        <span class="g-related-link">top load washing machine</span>
        <span class="g-related-link">semi automatic washing machine</span>
        <span class="g-related-link">lg washing machine</span>
        <span class="g-related-link">samsung washing machine</span>
        <span class="g-related-link">washing machine price</span>
        <span class="g-related-link">bosch washing machine</span>
        <span class="g-related-link">ifb washing machine</span>
        <span class="g-related-link">fully automatic washing machine</span>
      </div>
    </div>
  </div>
  <div class="g-shopping">
    <div style="font-size:15px;font-weight:600;margin-bottom:12px">Shopping results</div>
    <div class="g-shopping-card">
      <div style="height:180px;background:linear-gradient(135deg,#e8eaf6 0%,#c5cae9 100%);display:flex;align-items:center;justify-content:center"><svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#78909c" stroke-width="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/><circle cx="7" cy="6" r="0.5" fill="#78909c"/></svg></div>
      <div class="g-shopping-info">
        <div class="g-shopping-title">LG 8 Kg 5 Star Inverter Fully-Automatic Top Load Washing Machine</div>
        <div class="g-shopping-price">&#8377;15,990</div>
        <div class="g-shopping-rating">&#9733;&#9733;&#9733;&#9733;&#9733; 4.3 (2,145)</div>
        <div class="g-shopping-store">Amazon.in</div>
      </div>
    </div>
    <div class="g-shopping-card">
      <div style="height:180px;background:linear-gradient(135deg,#e3f2fd 0%,#bbdefb 100%);display:flex;align-items:center;justify-content:center"><svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#78909c" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="11" r="4"/><circle cx="12" cy="11" r="1.5"/><circle cx="8" cy="5" r="0.5" fill="#78909c"/></svg></div>
      <div class="g-shopping-info">
        <div class="g-shopping-title">Samsung 7 Kg 5 Star EcoBubble Fully-Automatic Front Load</div>
        <div class="g-shopping-price">&#8377;18,499</div>
        <div class="g-shopping-rating">&#9733;&#9733;&#9733;&#9733;&#9734; 4.2 (1,890)</div>
        <div class="g-shopping-store">Flipkart</div>
      </div>
    </div>
    <div class="g-shopping-card">
      <div style="height:180px;background:linear-gradient(135deg,#f3e5f5 0%,#e1bee7 100%);display:flex;align-items:center;justify-content:center"><svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#78909c" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/></svg></div>
      <div class="g-shopping-info">
        <div class="g-shopping-title">Bosch 8 Kg 5 Star AI ActiveWater Plus Fully-Automatic Front Load</div>
        <div class="g-shopping-price">&#8377;29,990</div>
        <div class="g-shopping-rating">&#9733;&#9733;&#9733;&#9733;&#9733; 4.5 (3,401)</div>
        <div class="g-shopping-store">Croma</div>
      </div>
    </div>
  </div>
</div>
<div class="g-footer">
  <a>Help</a><a>Send feedback</a><a>Privacy</a><a>Terms</a>
</div>
</body></html>`;

function createBlockerWindow() {
  const { bounds } = screen.getPrimaryDisplay();
  blockerWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    frame: true,
    focusable: false,
    skipTaskbar: false,
    show: false,
    title: 'washing machine - Google Search',
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  blockerWindow.loadURL('data:text/html,' + encodeURIComponent(DECOY_HTML));
}

function startAutoScroll() {
  if (scrollInterval) clearInterval(scrollInterval);
  scrollInterval = setInterval(() => {
    if (!blockerWindow || blockerWindow.isDestroyed() || !blockerWindow.isVisible()) return;
    blockerWindow.webContents.executeJavaScript(
      'window.scrollTo({top: Math.random() * document.body.scrollHeight, behavior: Math.random() > 0.5 ? "smooth" : "auto"})'
    ).catch(() => {});
  }, 5000 + Math.random() * 5000);
}

function stopAutoScroll() {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
}

function checkRemoteStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setContentProtection(true);
}

app.whenReady().then(() => {
  createMainWindow();
  checkInterval = setInterval(checkRemoteStatus, 2000);
  checkRemoteStatus();
});

app.on('window-all-closed', () => {
  stopAutoScroll();
  if (checkInterval) clearInterval(checkInterval);
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopAutoScroll();
  if (checkInterval) clearInterval(checkInterval);
});
