// ===== MENU TOGGLE =====
const menuBtn = document.getElementById('menuBtn');
const sideMenu = document.getElementById('sideMenu');
const menuLinks = document.querySelectorAll('.menu-link');

const homeSection = document.getElementById('homeSection');
const sosSection = document.getElementById('sosSection');
const routeSection = document.getElementById('routeSection');
const objectSection = document.getElementById('objectSection');
const helpSection = document.getElementById('helpSection'); // ✅ renamed

menuBtn.addEventListener('click', () => sideMenu.classList.toggle('translate-x-full'));

document.addEventListener('click', e => {
  if (!sideMenu.contains(e.target) && !menuBtn.contains(e.target)) sideMenu.classList.add('translate-x-full');
});

menuLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    
    // hide all sections
    homeSection.classList.add('hidden');
    sosSection.classList.add('hidden');
    routeSection.classList.add('hidden');
    objectSection.classList.add('hidden');
    helpSection.classList.add('hidden'); // ✅ hide help section too

    // show selected section
    if (link.dataset.sec === 'home') homeSection.classList.remove('hidden');
    else if (link.dataset.sec === 'object') objectSection.classList.remove('hidden');
    else if (link.dataset.sec === 'route') routeSection.classList.remove('hidden');
    else if (link.dataset.sec === 'sos') sosSection.classList.remove('hidden');
    else if (link.dataset.sec === 'help') helpSection.classList.remove('hidden'); // ✅ show help section

    sideMenu.classList.add('translate-x-full');
  });
});



// ===== TTS QUEUE (prevents overlap & prioritizes route messages) =====
const ttsQueue = [];
let ttsBusy = false;
function enqueueSpeak(text, options = { priority: false, replace: false }) {
  if (window.TTS && typeof window.TTS.speak === 'function') {
    try {
      window.TTS.speak({ text, rate: 1.0, pitch: 1.0, locale: 'en-US' });
      return;
    } catch (e) { /* fall back */ }
  }

  if (!('speechSynthesis' in window)) { console.log('TTS:', text); return; }
  if (options.replace) { speechSynthesis.cancel(); ttsQueue.length = 0; ttsBusy = false; }
  if (options.priority) ttsQueue.unshift(text);
  else ttsQueue.push(text);
  if (!ttsBusy) speakNext();
}
function speakNext() {
  if (!ttsQueue.length) { ttsBusy = false; return; }
  ttsBusy = true;
  const text = ttsQueue.shift();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0; utter.pitch = 1.0;
  utter.onend = () => setTimeout(() => speakNext(), 120);
  utter.onerror = () => setTimeout(() => speakNext(), 120);
  speechSynthesis.speak(utter);
}
function speak(text){ enqueueSpeak(text, { priority: false }); }

// ===== SOS CONTACTS (unchanged logic but using enqueueSpeak) =====
const nameInput   = document.getElementById('nameInput');
const numberInput = document.getElementById('numberInput');
const addBtn      = document.getElementById('addBtn');
const editBtn     = document.getElementById('editBtn');
const deleteBtn   = document.getElementById('deleteBtn');
const contactList = document.getElementById('contactList');
const sosBtn      = document.getElementById('sosBtn');

let contacts = JSON.parse(localStorage.getItem('sosContacts') || '[]');
let selectedIndex = null;

function saveContacts(){ localStorage.setItem('sosContacts', JSON.stringify(contacts)); }
function renderContacts(){
  contactList.innerHTML = '';
  contacts.forEach((c, idx) => {
    const li = document.createElement('li');
    li.className = 'border rounded-lg px-4 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100';
    li.textContent = `${c.name} — ${c.number}`;
    li.onclick = () => selectContact(idx);
    contactList.appendChild(li);
  });
}
function selectContact(index){
  selectedIndex = index;
  nameInput.value = contacts[index].name;
  numberInput.value = contacts[index].number;
}
addBtn.onclick = () => {
  const name = nameInput.value.trim();
  const number = numberInput.value.trim();
  if (!name || !number) { enqueueSpeak('Please enter both name and number'); return; }
  contacts.push({ name, number });
  saveContacts(); renderContacts();
  nameInput.value=''; numberInput.value=''; selectedIndex=null;
  enqueueSpeak('Contact added');
};
editBtn.onclick = () => {
  if(selectedIndex===null) { enqueueSpeak('Select a contact to edit'); return; }
  contacts[selectedIndex] = {name:nameInput.value.trim(),number:numberInput.value.trim()};
  saveContacts(); renderContacts(); enqueueSpeak('Contact updated');
};
deleteBtn.onclick = () => {
  if(selectedIndex===null) { enqueueSpeak('Select a contact to delete'); return; }
  contacts.splice(selectedIndex,1); saveContacts(); renderContacts();
  nameInput.value=''; numberInput.value=''; selectedIndex=null; enqueueSpeak('Contact deleted');
};
renderContacts();

async function sendSOS(contactNumber){
  if (!navigator.geolocation) { 
    enqueueSpeak('Geolocation not supported'); 
    return; 
  }

  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    try {
      // ✅ Create a valid Google Maps link
      const mapsLink = `https://www.google.com/maps?q=${lat},${lon}`;
      const message = encodeURIComponent(`HELP! I need assistance. My location: ${mapsLink}`);
      
      // ✅ Use SMS URL to open messaging app
      window.location.href = `sms:${contactNumber}?body=${message}`;
      enqueueSpeak('SOS message prepared');
    } catch (err) {
      enqueueSpeak('Unable to prepare SOS message');
      console.error(err);
    }

  }, err => enqueueSpeak('Location error: ' + err.message), { enableHighAccuracy: true });
}

sosBtn.onclick = ()=> {
  if(contacts.length===0){ enqueueSpeak('Add at least one contact'); return; }
  sendSOS(contacts[0].number);
};

// ===== UTIL: distance + nearest point on polyline =====
function getDistance(lat1,lon1,lat2,lon2){
  const R=6371000;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  return R*c;
}

// project point p onto segment ab, coordinates are [lon,lat] for polyline points
function nearestPointOnSegment(px,py, x1,y1, x2,y2){
  // convert to Cartesian approx using lat/lon as units for projection — fine for small distances
  const vx = x2 - x1, vy = y2 - y1;
  const wx = px - x1, wy = py - y1;
  const denom = vx*vx + vy*vy;
  let t = denom === 0 ? 0 : (vx*wx + vy*wy) / denom;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * vx, cy = y1 + t * vy;
  return { x: cx, y: cy, t };
}
function nearestPointOnPolyline(poly, lat, lon){
  // poly is array of [lon, lat]
  let minDist = Infinity, bestPoint = null, bestSegmentIndex = -1, bestT = 0;
  for (let i=0;i<poly.length-1;i++){
    const a = poly[i], b = poly[i+1];
    const res = nearestPointOnSegment(lon,lat, a[0],a[1], b[0],b[1]);
    const dist = getDistance(lat, lon, res.y, res.x); // careful: res.x is lon, res.y is lat
    if (dist < minDist){ minDist = dist; bestPoint = {lat: res.y, lon: res.x}; bestSegmentIndex=i; bestT = res.t; }
  }
  return { distance: minDist, point: bestPoint, segmentIndex: bestSegmentIndex, t: bestT };
}

// ===== ROUTE NAVIGATION (real-time with off-route reroute) =====
const navigateBtn = document.getElementById('navigateBtn');
const destinationInput = document.getElementById('destinationInput');

let mapInstance = null;
let mapLayer = null;
let poiLayer = null;
let userMarker = null;
let nextStepMarker = null;

let routeGeometryCoords = []; // array of [lon,lat]
let navigationSteps = [];     // array of {instruction, distance, lat, lon, index}
let currentStepIndex = 0;
let destCoordsGlobal = null;  // [lon, lat]
let watchId = null;
let cameraStarted = false;

const ORS_API_KEY = '5b3ce3597851110001cf6248478609bfabcf4b30bfd3606fc06c2d2e';
const OFF_ROUTE_THRESHOLD = 30; // meters: if user is > this from route polyline -> reroute
const STEP_ARRIVAL_THRESHOLD = 10; // meters considered step reached
const STEP_ANNOUNCE_RANGE = 30; // meters in which to announce upcoming step
const KEEP_WALKING_GUIDANCE_COOLDOWN = 10000; // ms between "keep walking" announcements
let lastKeepWalkingTime = 0;
let stepAnnouncedFlags = []; // per-step announced boolean
let stepReachedFlags = []; // per-step reached boolean

async function startNavigation(destText){
  if(!navigator.geolocation){ enqueueSpeak('Geolocation not supported'); return; }
  navigator.geolocation.getCurrentPosition(async pos=>{
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    try {
      const destRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destText)}`);
      const destData = await destRes.json();
      if(!destData.length){ enqueueSpeak('Destination not found'); return; }
      destCoordsGlobal = [parseFloat(destData[0].lon), parseFloat(destData[0].lat)];

      // show route screen
      routeSection.classList.remove('hidden'); homeSection.classList.add('hidden');

      // initialize map
      if(mapInstance) mapInstance.remove();
      mapInstance = L.map('map').setView([lat, lon], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(mapInstance);

      if(userMarker) userMarker.remove();
      userMarker = L.marker([lat,lon]).addTo(mapInstance).bindPopup('You are here');

      // fetch route
      await fetchAndParseRoute([lon,lat], destCoordsGlobal);

      // start watching position (more responsive than interval)
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(onPositionUpdate, posErr => {
        console.warn('watchPosition err', posErr);
      }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 });

    } catch (err) { console.error(err); enqueueSpeak('Failed to start navigation'); }
  }, err => enqueueSpeak('Location error: ' + err.message), { enableHighAccuracy:true });
}

async function fetchAndParseRoute(startLonLat, destLonLat){
  // startLonLat: [lon, lat], destLonLat: [lon, lat]
  try {
    const routeRes = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
      method: 'POST',
      headers: {'Authorization': ORS_API_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify({coordinates:[startLonLat, destLonLat]})
    });
    const routeData = await routeRes.json();
    if (mapLayer) { mapLayer.remove(); mapLayer = null; }
    mapLayer = L.geoJSON(routeData,{style:{color:'blue',weight:5}}).addTo(mapInstance);

    routeGeometryCoords = (routeData.features && routeData.features[0] && routeData.features[0].geometry && routeData.features[0].geometry.coordinates) || [];

    // parse steps (safe checks)
    const segments = routeData.features && routeData.features[0] && routeData.features[0].properties && routeData.features[0].properties.segments;
    navigationSteps = [];
    if (segments && segments[0] && Array.isArray(segments[0].steps)) {
      let stepIndex = 0;
      segments[0].steps.forEach(s => {
        // s.way_points usually contains [start_idx, end_idx] into routeGeometryCoords; choose end index for step target
        let targetCoord = routeGeometryCoords.length ? routeGeometryCoords[Math.min(routeGeometryCoords.length-1, (s.way_points && s.way_points[1]) || routeGeometryCoords.length-1)] : null;
        if (!targetCoord && routeGeometryCoords.length) targetCoord = routeGeometryCoords[routeGeometryCoords.length-1];
        const lat = targetCoord ? targetCoord[1] : 0;
        const lon = targetCoord ? targetCoord[0] : 0;
        navigationSteps.push({
          instruction: s.instruction || s.name || 'Continue',
          distance: s.distance || 0,
          lat, lon,
          index: stepIndex++
        });
      });
    } else {
      // fallback single-step
      navigationSteps = [{instruction: `Head to destination`, distance:0, lat: destLonLat[1], lon: destLonLat[0], index:0}];
    }

    // reset step flags
    stepAnnouncedFlags = navigationSteps.map(()=>false);
    stepReachedFlags = navigationSteps.map(()=>false);
    currentStepIndex = 0;

    enqueueSpeak('Route ready. ' + (navigationSteps[0] ? navigationSteps[0].instruction : 'Follow route'), { priority: true });

    // draw marker for destination & next step
    if (nextStepMarker) nextStepMarker.remove();
    const next = navigationSteps[currentStepIndex];
    if (next) nextStepMarker = L.marker([next.lat, next.lon], {opacity:0.8}).addTo(mapInstance).bindPopup('Next step');
    // fit bounds to route
    if (routeGeometryCoords && routeGeometryCoords.length) {
      const latlngs = routeGeometryCoords.map(c => [c[1], c[0]]);
      mapInstance.fitBounds(latlngs, { padding: [50,50] });
    }

  } catch (err) {
    console.error('Route fetch error', err);
    enqueueSpeak('Unable to fetch route');
  }
}

// position update handler
async function onPositionUpdate(position){
  const lat = position.coords.latitude, lon = position.coords.longitude;
  // update user marker
  if (!userMarker) userMarker = L.marker([lat,lon]).addTo(mapInstance).bindPopup('You are here');
  else userMarker.setLatLng([lat,lon]);

  // center map gently
  try { mapInstance.setView([lat,lon], mapInstance.getZoom()); } catch(e){}

  // If no route geometry, nothing to do
  if (!routeGeometryCoords || !routeGeometryCoords.length) return;

  // find nearest point on route polyline
  const nearest = nearestPointOnPolyline(routeGeometryCoords, lat, lon);
  const distToRoute = nearest.distance;

  // Off-route? -> reroute
  if (distToRoute > OFF_ROUTE_THRESHOLD) {
    enqueueSpeak('You are off route. Recalculating route.', { priority: true, replace: true });
    // fetch new route from current position to destination
    await fetchAndParseRoute([lon,lat], destCoordsGlobal);
    return;
  }

  // Decide current step: prefer currentStepIndex, but adjust if user passed it
  // Compute distance to current step target
  if (navigationSteps && navigationSteps.length>0) {
    // ensure currentStepIndex within range
    if (currentStepIndex >= navigationSteps.length) currentStepIndex = navigationSteps.length - 1;

    const nextStep = navigationSteps[currentStepIndex];
    const distToNextStep = getDistance(lat, lon, nextStep.lat, nextStep.lon);

    // if reached next step
    if (!stepReachedFlags[currentStepIndex] && distToNextStep <= STEP_ARRIVAL_THRESHOLD) {
      stepReachedFlags[currentStepIndex] = true;
      enqueueSpeak(`Step reached: ${nextStep.instruction}`, { priority: true });
      currentStepIndex++;
      // announce next
      if (currentStepIndex < navigationSteps.length) {
        enqueueSpeak(navigationSteps[currentStepIndex].instruction, { priority: true });
        // update next marker
        if (nextStepMarker) nextStepMarker.remove();
        const newNext = navigationSteps[currentStepIndex];
        if (newNext) nextStepMarker = L.marker([newNext.lat, newNext.lon], {opacity:0.9}).addTo(mapInstance).bindPopup('Next step');
      } else {
        enqueueSpeak('You have arrived at your destination', { priority: true });
      }
      return;
    }

    // if within announce range and not announced yet -> announce step instruction
    if (!stepAnnouncedFlags[currentStepIndex] && distToNextStep <= STEP_ANNOUNCE_RANGE) {
      stepAnnouncedFlags[currentStepIndex] = true;
      enqueueSpeak(nextStep.instruction, { priority: true });
      return;
    }

    // if far from step and time since last guidance passed -> give "keep walking"
    const now = Date.now();
    if (distToNextStep > STEP_ANNOUNCE_RANGE && (now - lastKeepWalkingTime > KEEP_WALKING_GUIDANCE_COOLDOWN)) {
      const meters = Math.round(distToNextStep);
      enqueueSpeak(`Keep walking for ${meters} meters`, { priority: true });
      lastKeepWalkingTime = now;
    }

    // if user seems to have skipped ahead beyond current step (e.g., closer to a later step), advance index
    for (let i = currentStepIndex + 1; i < navigationSteps.length; i++) {
      const d = getDistance(lat, lon, navigationSteps[i].lat, navigationSteps[i].lon);
      if (d + 5 < getDistance(lat, lon, navigationSteps[currentStepIndex].lat, navigationSteps[currentStepIndex].lon)) {
        // user is closer to later step, jump forward
        currentStepIndex = i;
        enqueueSpeak(`Moving to next instruction: ${navigationSteps[currentStepIndex].instruction}`, { priority: true });
        // update markers
        if (nextStepMarker) nextStepMarker.remove();
        nextStepMarker = L.marker([navigationSteps[currentStepIndex].lat, navigationSteps[currentStepIndex].lon], {opacity:0.9}).addTo(mapInstance).bindPopup('Next step');
        break;
      }
    }
  }

  // Start route camera detection when user begins moving sufficiently
  if (!cameraStarted) {
    // compute movement from lastLat/lastLon using a simple static property
    if (window._ev_lastPos) {
      const moved = getDistance(window._ev_lastPos.lat, window._ev_lastPos.lon, lat, lon);
      if (moved > 0.6) { cameraStarted = true; startRouteCameraDetection(); }
    }
    window._ev_lastPos = { lat, lon };
  }
}

// reroute on demand (public helper)
async function rerouteNow(){
  if (!watchId) { enqueueSpeak('No active navigation to reroute'); return; }
  if (!destCoordsGlobal) { enqueueSpeak('No destination set'); return; }
  // get current position once then fetch route
  navigator.geolocation.getCurrentPosition(async pos=>{
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    enqueueSpeak('Recalculating route', { priority: true });
    await fetchAndParseRoute([lon, lat], destCoordsGlobal);
  }, err => enqueueSpeak('Unable to get current location for reroute'));
}
navigateBtn.onclick = ()=>{ if(destinationInput.value.trim()!=='') startNavigation(destinationInput.value.trim()); };

// ===== OBJECT DETECTION FOR ROUTE (non-repeating announcements) =====
const cameraFront = document.getElementById('cameraFront');
const cameraBack = document.getElementById('cameraBack');
const canvasFront = document.getElementById('canvasFront');
const canvasBack = document.getElementById('canvasBack');
const ctxFront = canvasFront.getContext('2d');
const ctxBack = canvasBack.getContext('2d');

let detectionModel = null;
let detectionInterval = null;
const DETECT_COOLDOWN = 8000; // ms per label per camera
const lastAnnounceTime = { front: {}, back: {} };

function setCanvasSizeForVideo(videoEl, canvasEl){
  if (!videoEl || !canvasEl) return;
  if (videoEl.videoWidth && videoEl.videoHeight) { canvasEl.width = videoEl.videoWidth; canvasEl.height = videoEl.videoHeight; }
  else { canvasEl.width = 640; canvasEl.height = 480; }
}

async function startRouteCameraDetection(){
  try {
    if (!detectionModel) detectionModel = await cocoSsd.load();
  } catch (err) {
    console.error('Model load failed', err);
    enqueueSpeak('Object detection model failed to load');
    return;
  }

  // enumerate devices and attach to cameraFront/Back similar to your previous logic
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');
    if (videoInputs.length > 0) {
      await navigator.mediaDevices.getUserMedia({ video: { deviceId: videoInputs[0].deviceId } }).then(s => { cameraFront.srcObject = s; }).catch(()=>{});
      if (videoInputs[1]) await navigator.mediaDevices.getUserMedia({ video: { deviceId: videoInputs[1].deviceId } }).then(s => { cameraBack.srcObject = s; }).catch(()=>{});
      else if (cameraFront.srcObject) cameraBack.srcObject = cameraFront.srcObject;
    } else {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      cameraFront.srcObject = s; cameraBack.srcObject = s;
    }
  } catch (err) { console.warn('Camera getUserMedia error', err); }

  cameraFront.onloadedmetadata = ()=> setCanvasSizeForVideo(cameraFront, canvasFront);
  cameraBack.onloadedmetadata  = ()=> setCanvasSizeForVideo(cameraBack, canvasBack);

  if (detectionInterval) clearInterval(detectionInterval);
  detectionInterval = setInterval(async ()=>{
    if (!cameraStarted) return;
    // front
    if (cameraFront && cameraFront.readyState === 4 && detectionModel) {
      setCanvasSizeForVideo(cameraFront, canvasFront);
      ctxFront.clearRect(0,0,canvasFront.width,canvasFront.height);
      ctxFront.drawImage(cameraFront, 0, 0, canvasFront.width, canvasFront.height);
      try {
        const preds = await detectionModel.detect(canvasFront);
        const now = Date.now();
        preds.forEach(p => {
          if (!p.class || p.score < 0.45) return;
          ctxFront.strokeStyle = 'red'; ctxFront.lineWidth = Math.max(2, Math.round(2 * p.score));
          ctxFront.strokeRect(p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]);
          ctxFront.fillStyle = 'red'; ctxFront.font = '16px Arial';
          ctxFront.fillText(`${p.class}`, Math.max(0,p.bbox[0]), Math.max(16,p.bbox[1]-5));
          const last = lastAnnounceTime.front[p.class] || 0;
          if (now - last > DETECT_COOLDOWN) {
            enqueueSpeak(`${p.class} ahead`);
            lastAnnounceTime.front[p.class] = now;
          }
        });
      } catch (err) { console.warn('Front detection error', err); }
    }
    // back
    if (cameraBack && cameraBack.readyState === 4 && detectionModel) {
      setCanvasSizeForVideo(cameraBack, canvasBack);
      ctxBack.clearRect(0,0,canvasBack.width,canvasBack.height);
      ctxBack.drawImage(cameraBack, 0, 0, canvasBack.width, canvasBack.height);
      try {
        const preds = await detectionModel.detect(canvasBack);
        const now = Date.now();
        preds.forEach(p => {
          if (!p.class || p.score < 0.45) return;
          ctxBack.strokeStyle = 'red'; ctxBack.lineWidth = Math.max(2, Math.round(2 * p.score));
          ctxBack.strokeRect(p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]);
          ctxBack.fillStyle = 'red'; ctxBack.font = '16px Arial';
          ctxBack.fillText(`${p.class}`, Math.max(0,p.bbox[0]), Math.max(16,p.bbox[1]-5));
          const last = lastAnnounceTime.back[p.class] || 0;
          if (now - last > DETECT_COOLDOWN) {
            enqueueSpeak(`${p.class} behind`);
            lastAnnounceTime.back[p.class] = now;
          }
        });
      } catch (err) { console.warn('Back detection error', err); }
    }
  }, 600);
}

// preview/camera setup for object section
const objCameraFront = document.getElementById('objCameraFront');
const objCameraBack  = document.getElementById('objCameraBack');
const frontCanvasPreview = document.getElementById('frontCanvas');
const backCanvasPreview = document.getElementById('backCanvas');

async function setupPreviewCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d=>d.kind === 'videoinput');
    if(videoInputs.length>0){
      await navigator.mediaDevices.getUserMedia({video:{deviceId: videoInputs[0].deviceId}}).then(stream => { objCameraFront.srcObject = stream; });
      if(videoInputs[1]) await navigator.mediaDevices.getUserMedia({video:{deviceId: videoInputs[1].deviceId}}).then(stream => { objCameraBack.srcObject = stream; });
      else if(!objCameraBack.srcObject) objCameraBack.srcObject = objCameraFront.srcObject;
    } else {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      objCameraFront.srcObject = s; objCameraBack.srcObject = s;
    }
  } catch (err) { console.warn('Preview camera setup failed', err); }
}
setupPreviewCameras();

// ===== INITIAL VOICE COMMAND & SOS contact chooser (unchanged but safe) =====
function startInitialVoiceCommand(){
  enqueueSpeak("Welcome, say your destination or SOS");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { enqueueSpeak('Speech recognition not supported in this browser'); return; }
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
  recognition.start();
  recognition.onresult = (event)=>{
    const speech = event.results[0][0].transcript.toLowerCase();
    if (speech.includes('sos')) {
      homeSection.classList.add('hidden'); sosSection.classList.remove('hidden'); announceContactsForSOS();
    } else {
      destinationInput.value = speech;
      startNavigation(speech);
    }
  };
  recognition.onend = ()=> { /* do not auto restart */ };
  recognition.onerror = (e) => { console.warn('Speech error', e); enqueueSpeak('Voice recognition error'); };
}

function announceContactsForSOS(){
  if(contacts.length===0){ enqueueSpeak("No SOS contacts saved"); return; }
  const contactNames = contacts.map(c=>c.name).join(', ');
  enqueueSpeak(`These are your contacts: ${contactNames}. Who to send SOS?`);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { enqueueSpeak('Speech recognition not supported'); return; }
  const recognition = new SpeechRecognition();
  recognition.lang='en-US'; recognition.interimResults=false; recognition.continuous=false;
  recognition.start();
  recognition.onresult = (e)=>{
    const spokenName = e.results[0][0].transcript.toLowerCase();
    const contact = contacts.find(c=>c.name.toLowerCase()===spokenName);
    if(contact){ sendSOS(contact.number); enqueueSpeak(`SOS sent to ${contact.name}`); }
    else { enqueueSpeak("Contact not found"); }
  };
  recognition.onend = ()=>{};
}

// ===== OPTIONAL: helper to force reroute (dev) =====
// window.rerouteNow = rerouteNow;

// ===== AUTOMATIC VOICE COMMAND ON APP LOAD =====
window.addEventListener('load', () => {
  enqueueSpeak("Welcome, say your destination or SOS", { priority: true, replace: true });
  startInitialVoiceCommandAuto();
});

function startInitialVoiceCommandAuto() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { enqueueSpeak('Speech recognition not supported in this browser'); return; }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.continuous = true; // keep listening

  recognition.onresult = (event) => {
    const speech = event.results[event.results.length - 1][0].transcript.toLowerCase();
    console.log('Voice input:', speech);

    if (speech.includes('sos') || speech.includes('send sos')) {
      if (contacts.length > 0) {
        sendSOS(contacts[0].number);
        enqueueSpeak(`SOS sent to ${contacts[0].name}`);
      } else {
        enqueueSpeak('No SOS contacts available');
      }
    } 
    else if (speech.includes('detection') || speech.includes('object')) {
      // ✅ Show Object Detection screen
      homeSection.classList.add('hidden');
      sosSection.classList.add('hidden');
      routeSection.classList.add('hidden');
      helpSection.classList.add('hidden');
      objectSection.classList.remove('hidden');
      startObjectDetection(); // start the camera detection
      enqueueSpeak('Starting object detection');
    }
    else {
      destinationInput.value = speech;
      startNavigation(speech); // your existing navigation logic
    }
  };

  recognition.onerror = (e) => { console.warn('Speech recognition error', e); enqueueSpeak('Voice recognition error'); };
  recognition.onend = () => recognition.start(); // auto-restart

  recognition.start();
}

// ===== OBJECT DETECTION: BACK CAMERA =====
const objCamera = document.getElementById('objCamera'); // video element
const objCanvas = document.getElementById('objCanvas'); // canvas overlay
const objCtx = objCanvas.getContext('2d');

let objDetectionModel = null;
let objDetectionInterval = null;
const OBJ_DETECT_COOLDOWN = 8000; // 8 seconds per label
const objLastAnnounceTime = {};

function setObjCanvasSize() {
  if (objCamera.videoWidth && objCamera.videoHeight) {
    objCanvas.width = objCamera.videoWidth;
    objCanvas.height = objCamera.videoHeight;
    objCanvas.style.width = objCamera.offsetWidth + 'px';
    objCanvas.style.height = objCamera.offsetHeight + 'px';
  }
}

async function startObjectDetection() {
  try {
    if (!objDetectionModel) objDetectionModel = await cocoSsd.load();
  } catch (err) {
    console.error('Object detection model failed', err);
    enqueueSpeak('Object detection model failed to load');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: "environment" } } // back camera
    });
    objCamera.srcObject = stream;
  } catch (err) {
    console.warn('Back camera access error', err);
    enqueueSpeak('Cannot access back camera');
    return;
  }

  objCamera.onloadedmetadata = () => setObjCanvasSize();

  if (objDetectionInterval) clearInterval(objDetectionInterval);
  objDetectionInterval = setInterval(async () => {
    if (objCamera.readyState === 4 && objDetectionModel) {
      setObjCanvasSize();
      objCtx.clearRect(0, 0, objCanvas.width, objCanvas.height);
      objCtx.drawImage(objCamera, 0, 0, objCanvas.width, objCanvas.height);

      try {
        const preds = await objDetectionModel.detect(objCanvas);
        const now = Date.now();
        preds.forEach(p => {
          if (!p.class || p.score < 0.45) return;
          objCtx.strokeStyle = 'red';
          objCtx.lineWidth = Math.max(2, Math.round(2 * p.score));
          objCtx.strokeRect(p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]);
          objCtx.fillStyle = 'red';
          objCtx.font = '16px Arial';
          objCtx.fillText(`${p.class}`, Math.max(0, p.bbox[0]), Math.max(16, p.bbox[1] - 5));

          const last = objLastAnnounceTime[p.class] || 0;
          if (now - last > OBJ_DETECT_COOLDOWN) {
            enqueueSpeak(`${p.class} ahead`);
            objLastAnnounceTime[p.class] = now;
          }
        });
      } catch (err) {
        console.warn('Object detection error', err);
      }
    }
  }, 600);
}

// Start detection when object section is opened
const objectSectionBtn = document.querySelector('.menu-link[data-sec="object"]');
objectSectionBtn.addEventListener('click', () => {
  startObjectDetection();
});


