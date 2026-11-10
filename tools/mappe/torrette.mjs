// Generates server/seed/torrette.json: Ospedale di Torrette (Ancona), AOU delle Marche.
//   node tools/mappe/torrette.mjs
//
// Sources (read in November 2026):
//  - wards, floors, lifts and directions: the "Dove siamo / Come arrivare" section of each ward's page
//    on https://portale.ospedaliriuniti.marche.it (Reparti - SOD);
//  - shape of the original building (spine I - IB - B with the wings N, L, E, A, C): the structural
//    scheme published by SEITEC for the seismic retrofit ("Ospedale Regionale Torrette - Ancona").
//  - roads and the position of the Malattie Infettive building: OpenStreetMap (© OpenStreetMap
//    contributors, ODbL), fitted onto the scheme; see strade-torrette.json.
// The plan is a SCHEME, not to scale. The position of the other bodies (F, H, R, S, T, T1, U, V, the
// entrance hall, Malattie Infettive, Radioterapia) is only indicative: it follows what the directions
// say (lift 1 left of the entrance, lift 4 right, lifts 5-6-7 along the green line) and must be
// checked on site. Lifts 5, 6 and 7 are placed in B, IB and I because they serve the wings that
// meet there (A and C; E; N and L).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server', 'seed', 'torrette.json');

// ---------------------------------------------------------------- plan (x to the right, y down)

// A wing: a rectangle `len` long and `w` wide starting at (x, y) and pointing along `deg`.
function wing(x, y, deg, len, w = 9) {
  const a = (deg * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy * (w / 2), ny = dx * (w / 2);
  const r = (v) => Math.round(v * 10) / 10;
  return [[r(x + nx), r(y + ny)], [r(x + dx * len + nx), r(y + dy * len + ny)], [r(x + dx * len - nx), r(y + dy * len - ny)], [r(x - nx), r(y - ny)]];
}
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// id, name on the map, colour, outline, description for the directions
const BLOCKS = [
  // original building: the spine and its five wings
  ['I', 'I', '#90A4AE', [[57, 34], [63, 34], [64, 46], [56, 46]], 'Corpo I (nodo centrale, ascensore 7)'],
  ['IB', 'IB', '#78909C', [[56, 46], [64, 46], [65, 62], [55, 62]], 'Corpo IB (nodo centrale, ascensore 6)'],
  ['B', 'B', '#90A4AE', [[55, 62], [65, 62], [63, 76], [57, 76]], 'Corpo B (nodo centrale, ascensore 5)'],
  ['N', 'N', '#4285F4', wing(58, 32, 195.4, 37), 'Corpo N'],
  ['L', 'L', '#26A69A', wing(62, 32, -25, 37), 'Corpo L'],
  ['E', 'E', '#7CB342', box(65, 50, 100, 58), 'Corpo E'],
  ['A', 'A', '#E4572E', wing(58, 78, 164.6, 37), 'Corpo A'],
  ['C', 'C', '#F3A712', wing(62, 78, 25, 37), 'Corpo C'],
  // low blocks around the spine (position indicative)
  ['F', 'F', '#AB7DF6', box(30, 40, 54, 70), 'Corpo F (piastra centrale)'],
  ['H', 'H', '#EC6FA9', box(56, 20, 64, 27), 'Corpo H'],
  ['S', 'S', '#D4C24A', box(67, 61, 84, 70), 'Corpo S'],
  ['R', 'R', '#C0392B', [[34, 71.5], [53, 71.5], [53, 74], [34, 78.5]], 'Corpo R'],
  // newer buildings by the main entrance (position indicative)
  ['ATR', 'Atrio', '#E0E0E0', box(9, 82, 20, 93), 'Atrio dell\'ingresso principale'],
  ['T', 'T', '#5C6BC0', box(2, 62, 14, 80), 'Corpo T'],
  ['T1', 'T1', '#7986CB', box(15, 66, 24, 80), 'Corpo T1'],
  ['V', 'V', '#9FA8DA', box(2, 50, 14, 61), 'Corpo V'],
  ['U', 'U', '#26C6DA', box(6, 95, 30, 106), 'Corpo U'],
  // separate buildings
  // separate buildings: Malattie Infettive with its real outline (OpenStreetMap), south of the main building
  ['MI', 'Mal. Infettive', '#8D6E63', [[43.2, 122.5], [39.7, 128.3], [19.4, 125.1], [17.6, 135.2], [38.6, 138.7], [37.4, 141.3], [36.2, 143.4], [16.4, 140.9], [15, 151.9], [33, 154.4], [45.2, 171.1], [54.5, 164.4], [40.8, 145.7], [41.7, 143.7], [43, 141.6], [57.2, 157.9], [64.9, 151.2], [52.4, 137], [56.4, 130.2]], 'Palazzina Malattie Infettive (staccata dal corpo centrale, a sud)'],
  ['RT', 'Radioterapia', '#A1887F', box(60, 162, 72, 171), 'Padiglione di Radioterapia, dietro la palazzina Malattie Infettive']
];
// Floors a body has even where no ward is listed on them.
const FLOORS = { I: [-1, 6], IB: [-1, 6], B: [-1, 6], ATR: [-1, 1], H: [-1, 0], R: [0, 1], S: [0, 2], MI: [-1, 2], RT: [0, 0] };

// ---------------------------------------------------------------- entrances and lifts

const INGRESSI = [
  { id: 'tor-ing-principale', nome: 'Ingresso principale – Reception', sigla: 'P', piano: 0, corpo: 'ATR', punto: { x: 10, y: 91 }, nota: 'Via Conca 71, Piano 0. Dalla reception: ascensore 1 a sinistra, ascensore 4 a destra, ascensori 5, 6 e 7 avanti lungo la linea verde' },
  { id: 'tor-ing-ps', nome: 'Pronto Soccorso', sigla: 'PS', piano: 1, corpo: 'C', punto: { x: 92, y: 92 }, badge: 'ambulanze', nota: 'Piano 1, Corpo C (accesso ambulanze: da verificare sul posto)' },
  { id: 'tor-ing-posteriore', nome: 'Ingresso posteriore – Blocco B', sigla: 'B', piano: 1, corpo: 'B', punto: { x: 63, y: 69 }, nota: 'Piano 1: area dei servizi per l\'utenza (bar, edicola, bancomat)' },
  { id: 'tor-ing-mi', nome: 'Palazzina Malattie Infettive', sigla: 'MI', piano: 0, corpo: 'MI', punto: { x: 30, y: 127.5 }, nota: 'Dalla strada interna, dopo la rotatoria dell\'elisoccorso: segnaletica "Malattie Infettive"' },
  { id: 'tor-ing-rt', nome: 'Radioterapia', sigla: 'RT', piano: 0, corpo: 'RT', punto: { x: 63, y: 163 }, nota: 'Padiglione dietro Malattie Infettive: dalla rotatoria sopra l\'elisoccorso entrare nel parcheggio dipendenti e seguire i cartelli' }
];
const ASCENSORI = [
  { id: 'tor-asc-1', sigla: '1', corpo: 'T', nota: 'A sinistra dell\'ingresso principale: corpi T, T1 e V' },
  { id: 'tor-asc-23', sigla: '2-3', corpo: 'ATR', nota: 'Nell\'atrio, accanto alla scalinata: scendono al Piano -1' },
  { id: 'tor-asc-4', sigla: '4', corpo: 'U', nota: 'A destra della reception: corpo U' },
  { id: 'tor-asc-5', sigla: '5', corpo: 'B', nota: 'Avanti lungo la linea verde: corpi A e C' },
  { id: 'tor-asc-6', sigla: '6', corpo: 'IB', nota: 'Avanti lungo il corridoio: corpi C, E, F e A' },
  { id: 'tor-asc-7', sigla: '7', corpo: 'I', nota: 'In fondo al corridoio: corpi N, L e H' }
];

// ---------------------------------------------------------------- wards
// [id, name, type, body, floor, lift, phone, keywords, extra]. `extra`: { dove, note, ing }.
// "dove" defaults to "Corpo X - ascensore n"; the entrance defaults to the main one.
const D = 'Degenza', AMB = 'Ambulatorio', SRV = 'Servizio', DH = 'Day Hospital', EM = 'Emergenza';
const REPARTI = [
  // ---- Piano -1
  ['immunologia', 'Immunologia clinica', AMB, 'A', -1, '2-3', '071 5964093', 'immunologia allergie immunologo malattie rare trapianti', { dove: 'Dall\'atrio scendere al Piano -1 (scalinata o ascensori 2-3) e andare in direzione "Farmacia" fino all\'insegna "Immunologia" (porta blu AS18)' }],
  ['medicina-nucleare', 'Medicina Nucleare', SRV, 'F', -1, '2-3', '071 5964140', 'medicina nucleare pet scintigrafia', { dove: 'Seguire la linea verde fino alla Segreteria unificata della Radiologia (Piano 0): lì indicano la linea colorata da seguire' }],
  ['farmacia', 'Farmacia', SRV, 'H', -1, '7', '', 'farmacia ospedaliera farmaci'],
  ['riabilitativa', 'Medicina Riabilitativa', AMB, 'U', -1, '4', '', 'medicina riabilitativa fisiatria fisioterapia riabilitazione palestra'],
  ['neuroriabilitazione-amb', 'Clinica di Neuroriabilitazione – Ambulatori', AMB, 'U', -1, '2-3', '071 5965107', 'neuroriabilitazione riabilitazione neurologica', { dove: 'Dall\'ingresso principale scendere la scalinata (o ascensori 2-3) e girare a sinistra' }],
  ['fisica-sanitaria', 'Fisica Sanitaria', SRV, 'MI', -1, null, '071 5964847', 'fisica sanitaria radioprotezione', { ing: 'tor-ing-mi', dove: 'Piano -1 della palazzina Malattie Infettive. Dall\'interno: ascensore 6, scendere al Piano -1 e seguire il corridoio verso la Radioterapia' }],
  // ---- Piano 0
  ['reception', 'Portineria – Reception', SRV, 'ATR', 0, null, '071 5961', 'portineria reception informazioni centralino ingresso principale', { dove: 'Subito all\'ingresso principale (via Conca 71)' }],
  ['cup', 'CUP', SRV, 'ATR', 0, null, '', 'cup prenotazioni cassa ticket accettazione', { dove: 'Vicino all\'ingresso principale, accanto alla Segreteria della Radiologia' }],
  ['urp', 'Ufficio Relazioni con il Pubblico (U.R.P.)', SRV, 'ATR', 0, null, '', 'urp relazioni pubblico reclami informazioni', { dove: 'Piano 0, di fianco alla Portineria' }],
  ['radiologia', 'Clinica di Radiologia', SRV, 'F', 0, null, '071 5964085', 'radiologia rx tac risonanza ecografia diagnostica per immagini neuroradiologia', { dove: 'Segreteria unificata della Radiologia al Piano 0, vicino all\'ingresso principale (linea verde). Sale anche al Piano -1 e al Pronto Soccorso (Piano 1)' }],
  ['radiologia-interventistica', 'Radiologia Interventistica', SRV, 'A', 0, null, '071 5964107', 'radiologia interventistica angiografia', { dove: 'Accanto alla Segreteria della Radiologia: seguire la linea bianca indicata dal personale' }],
  ['direzione', 'Direzione aziendale', SRV, 'C', 0, '5', '071 5963115', 'direzione generale aziendale', { dove: 'Pochi metri dopo l\'ingresso principale, vicino all\'ascensore 5' }],
  ['trasfusionale', 'Medicina Trasfusionale', SRV, 'C', 0, null, '071 5964003', 'trasfusionale donatori sangue centro trasfusionale', { dove: 'Piano 0, tra i corpi C e S: dopo la reception girare a destra e seguire "Medicina trasfusionale"' }],
  ['ematologia-amb', 'Clinica Ematologica – Ambulatori', AMB, 'C', 0, '5', '', 'ematologia ambulatori sangue leucemia linfoma', { note: 'Ambulatori C, D ed E al Piano 0; la degenza è al Piano 2' }],
  ['nefrologia', 'Nefrologia', D, 'L', 0, '7', '', 'nefrologia reni trapianto rene'],
  ['dialisi', 'Dialisi e ambulatori Trapianto di rene', AMB, 'N', 0, '7', '', 'dialisi emodialisi peritoneale trapianto rene nefrologia'],
  ['mal-inf-amb', 'Malattie Infettive – Piano 0', AMB, 'MI', 0, null, '071 5963466', 'malattie infettive ambulatori epatiti parassitologia tropicali', { ing: 'tor-ing-mi' }],
  ['radioterapia', 'Radioterapia', SRV, 'RT', 0, null, '071 5964842', 'radioterapia oncologia', { ing: 'tor-ing-rt', note: 'Parcheggio dedicato: serve l\'autorizzazione o l\'impegnativa per la visita' }],
  // ---- Piano 1
  ['ps', 'Pronto Soccorso e Medicina d\'Urgenza', EM, 'C', 1, '6', '071 5965096', 'pronto soccorso ps emergenza urgenza triage', { ing: 'tor-ing-ps', dove: 'Corpo C, Piano 1. Dall\'ingresso principale: ascensore 6' }],
  ['rianimazione', 'Clinica di Anestesia e Rianimazione generale', D, 'C', 1, '6', '071 5964602', 'rianimazione terapia intensiva anestesia', { dove: 'Ascensore 6 fino al Piano 1, poi a destra', note: 'La Rianimazione clinica è al Piano 2' }],
  ['rianimazione-trapianti', 'Anestesia e Rianimazione dei Trapianti e Chirurgia maggiore', D, 'A', 1, '5', '071 5963399', 'rianimazione trapianti terapia intensiva anestesia', { dove: 'Ascensore 5 fino al Piano 1, poi a sinistra' }],
  ['rianimazione-cardio', 'Anestesia e Rianimazione Cardiochirurgica', D, 'R', 1, '5', '071 5965312', 'rianimazione cardiochirurgica terapia intensiva', { dove: 'Ascensore 5 fino al Piano 1, poi a destra: è alla destra della sala operatoria' }],
  ['cardiochirurgia-ti', 'Cardiochirurgia – Piano 1', D, 'T', 1, '6', '', 'cardiochirurgia terapia intensiva', { dove: 'Corpo T, Piano 1: seguire dritto il corridoio in direzione dell\'ascensore 6' }],
  ['psichiatria', 'Clinica Psichiatrica', D, 'N', 1, '7', '071 5963499', 'psichiatria spdc salute mentale adolescenti', { dove: 'Ascensore 7 fino al Piano 1, poi a sinistra seguendo la riga verde fino in fondo al corridoio (corpi L e N; area adolescenti nei corpi F e N)' }],
  ['anatomia', 'Anatomia Patologica', SRV, 'F', 1, '6', '071 5965786', 'anatomia patologica istologico biopsie', { dove: 'Ascensore 6, poi a sinistra verso la Cappella. Laboratori e accettazione campioni al Piano 1, segreteria al Piano 2', note: 'Il corpo non è indicato sul sito: da verificare' }],
  ['donazione-organi', 'Coordinamento Donazione Organi', SRV, 'F', 1, '6', '071 5965383', 'donazione organi trapianti coordinamento', { dove: 'Stanza 158, accanto alla Direzione medica e vicino all\'atrio del bar' }],
  ['professioni-sanitarie', 'Area Professioni Sanitarie', SRV, 'F', 1, '6', '071 5965455', 'professioni sanitarie direzione infermieristica'],
  ['igiene', 'Igiene Ospedaliera', SRV, 'I', 1, '7', '071 5963691', 'igiene ospedaliera'],
  ['spp', 'Prevenzione e Protezione', SRV, 'IB', 1, '6', '071 5965304', 'prevenzione protezione spp sicurezza', { dove: 'Di fronte all\'ascensore 6, al Piano 1' }],
  ['direzione-medica', 'Direzione Medica Ospedaliera', SRV, 'B', 1, null, '071 5964186', 'direzione medica dmo', { ing: 'tor-ing-posteriore', dove: 'Piano 1, Blocco B: dall\'ingresso posteriore, davanti ai servizi per l\'utenza (bar, edicola, bancomat)' }],
  ['servizio-sociale', 'Servizio Sociale', SRV, 'B', 1, null, '', 'servizio sociale assistenti sociali', { ing: 'tor-ing-posteriore', dove: 'Piano 1, Blocco B, dall\'ingresso posteriore' }],
  ['medico-competente', 'Medico Competente', SRV, 'B', 1, '5', '071 5964309', 'medico competente sorveglianza sanitaria'],
  ['bar', 'Bar – Edicola – Bancomat', SRV, 'B', 1, null, '', 'bar caffe edicola bancomat ristoro', { ing: 'tor-ing-posteriore', dove: 'Piano 1, nell\'atrio dell\'ingresso posteriore' }],
  ['mal-inf-tropicali', 'Clinica Malattie Infettive tropicali, Parassitologia, Epatiti croniche', D, 'MI', 1, null, '071 5963466', 'malattie infettive tropicali parassitologia epatiti', { ing: 'tor-ing-mi' }],
  // ---- Piano 2
  ['medicina-urgenza', 'Medicina Interna e d\'Urgenza – settore ordinario', D, 'A', 2, '6', '', 'medicina interna urgenza degenza'],
  ['medicina-subintensiva', 'Medicina d\'Urgenza – Subintensiva', D, 'S', 2, '6', '', 'medicina urgenza subintensiva semintensiva'],
  ['ematologia', 'Clinica Ematologica', D, 'C', 2, '6', '', 'ematologia leucemia linfoma trapianto midollo', { dove: 'Corpo C, Piano 2: ascensore 6 o 7' }],
  ['oncologia', 'Clinica Oncologica – Degenza', D, 'L', 2, '7', '071 5964169', 'oncologia tumori chemioterapia degenza', { dove: 'Ascensore 6 o 7 fino al Piano 2, a sinistra, poi seguire la segnaletica' }],
  ['oncologia-dh', 'Clinica Oncologica – Day Hospital', DH, 'N', 2, '7', '071 5964169', 'oncologia tumori chemioterapia day hospital', { dove: 'Ascensore 6 o 7 fino al Piano 2, a sinistra, poi seguire la segnaletica' }],
  ['laboratorio', 'Laboratorio Analisi', SRV, 'F', 2, '6', '', 'laboratorio analisi prelievi esami', { dove: 'Percorso verde fino all\'ascensore 6, Piano 2: usciti dall\'ascensore a sinistra e poi ancora a sinistra' }],
  ['mal-inf-emergenti', 'Malattie Infettive emergenti e degli immunodepressi', D, 'MI', 2, null, '071 5963412', 'malattie infettive immunodepressi hiv', { ing: 'tor-ing-mi' }],
  // ---- Piano 3
  ['clinica-chirurgica', 'Clinica Chirurgica', D, 'U', 3, '4', '071 5966607', 'chirurgia generale clinica chirurgica', { dove: 'Linea verde a destra, ascensore 4' }],
  ['cardiochirurgia', 'Cardiochirurgia', D, 'T', 3, '1', '', 'cardiochirurgia cuore', { dove: 'A sinistra dell\'ingresso principale, ascensore 1' }],
  ['medicina-lavoro', 'Medicina del Lavoro', AMB, 'T', 3, '1', '071 5964305', 'medicina del lavoro'],
  ['clinica-medica', 'Clinica Medica', D, 'C', 3, '5', '071 5964205', 'clinica medica medicina interna', { dove: 'Linea verde avanti fino all\'ascensore 5' }],
  ['gastro-a', 'Gastroenterologia ed Epatologia – Degenza A (ciclo ordinario)', D, 'L', 3, '7', '071 5964600', 'gastroenterologia epatologia endoscopia digestiva fegato danno epatico trapianti malattie apparato digerente', { dove: 'Ascensore 6 o 7' }],
  ['gastro-b', 'Gastroenterologia ed Epatologia – Degenza B (ciclo breve)', D, 'N', 3, '7', '071 5964688', 'gastroenterologia epatologia endoscopia digestiva mici malattie infiammatorie croniche intestinali', { dove: 'Ascensore 6 o 7' }],
  ['dietetica', 'Dietetica e Nutrizione clinica', AMB, 'E', 3, '6', '071 5963585', 'dietetica nutrizione clinica dietista'],
  ['medicina-legale', 'Medicina Legale', SRV, 'E', 3, '6', '071 5964717', 'medicina legale'],
  // ---- Piano 4
  ['ortopedia-clinica', 'Clinica di Ortopedia adulta e pediatrica', D, 'U', 4, '4', '071 5964441', 'ortopedia clinica ortopedica adulta pediatrica', { dove: 'A destra della reception, ascensore 4' }],
  ['ortopedia', 'Ortopedia e Traumatologia', D, 'U', 4, '4', '071 5964480', 'ortopedia traumatologia fratture sala gessi', { dove: 'Ascensore 4 fino al Piano 4', note: 'Sala gessi: ascensore 5, Piano 4, in fondo al corridoio principale a destra' }],
  ['utic', 'Cardiologia Ospedaliera e UTIC', D, 'T1', 4, '1', '071 5965705', 'cardiologia utic unita coronarica cuore infarto', { dove: 'Linea verde a sinistra fino all\'ascensore 1, Piano 4: la degenza è a sinistra della sala d\'attesa, l\'UTIC a destra' }],
  ['cardiologia-clinica', 'Clinica di Cardiologia e Aritmologia', D, 'A', 4, '5', '071 5965440', 'cardiologia aritmologia cuore pacemaker', { dove: 'Ascensore 5 fino al Piano 4 (reparto a sinistra), oppure ascensore 6 (reparto a destra)' }],
  ['unita-spinale', 'Unità Spinale', D, 'C', 4, '5', '071 5964949', 'unita spinale midollo lesioni', { dove: 'Ascensore 5 o 6' }],
  ['senologia', 'Chirurgia Senologica', D, 'N', 4, '7', '071 5963416', 'senologia chirurgia seno mammella', { dove: 'Linea verde, ascensori 6 e 7' }],
  ['orl', 'Otorinolaringoiatria – Degenze', D, 'N', 4, '6', '071 5964041', 'otorinolaringoiatria orl otorino', { note: 'Gli ambulatori sono al Piano 6 del corpo E' }],
  ['chirurgia-mano', 'Chirurgia Ricostruttiva e Chirurgia della Mano', D, 'L', 4, '7', '071 5963226', 'chirurgia mano ricostruttiva', { dove: 'Ascensori 6 e 7' }],
  ['toracica', 'Chirurgia Toracica', D, 'L', 4, '7', '071 5963563', 'chirurgia toracica polmoni torace'],
  ['virologia', 'Virologia', SRV, 'E', 4, '6', '071 5964928', 'virologia laboratorio', { dove: 'Linea verde, ascensore 6 o 7' }],
  // ---- Piano 5
  ['neurochirurgia-clinica', 'Clinica di Neurochirurgia oncologica e d\'urgenza', D, 'U', 5, '5', '071 5965220', 'neurochirurgia clinica oncologica urgenza'],
  ['neurochirurgia', 'Neurochirurgia generale', D, 'U', 5, '5', '071 5965658', 'neurochirurgia', { dove: 'A destra della reception, in direzione dell\'ascensore 5' }],
  ['odontostomatologia', 'Odontostomatologia chirurgica e speciale – Degenza', D, 'U', 5, '5', '071 5963159', 'odontostomatologia odontoiatria denti'],
  ['cardiochirurgia-pediatrica', 'Cardiochirurgia e Cardiologia pediatrica e congenita', D, 'V', 5, '1', '071 5965316', 'cardiochirurgia cardiologia pediatrica congenita bambini cuore', { dove: 'Corpi T e V, Piano 5: linea verde, ascensore 1' }],
  ['neurologia', 'Clinica Neurologica – Degenza', D, 'N', 5, '7', '071 5964530', 'neurologia clinica neurologica neuroriabilitazione degenza', { dove: 'Avanti fino all\'ascensore 7, Piano 5, poi a sinistra', note: 'Qui dentro c\'è anche la degenza della Neuroriabilitazione' }],
  ['neurologia-dh', 'Clinica Neurologica – Day Hospital', DH, 'L', 5, '7', '071 5964530', 'neurologia day hospital'],
  ['vascolare', 'Chirurgia Vascolare', D, 'N', 5, '5', '071 5965258', 'chirurgia vascolare', { note: 'Il sito indica l\'ascensore 5 per l\'ambulatorio e l\'ascensore 1 per la sala d\'attesa del reparto: da verificare' }],
  ['dermatologia', 'Clinica di Dermatologia – Degenza', D, 'A', 5, '5', '071 5963432', 'dermatologia pelle'],
  ['endocrinologia', 'Clinica di Endocrinologia e Malattie del Metabolismo', D, 'A', 5, '5', '071 5964442', 'endocrinologia metabolismo diabete tiroide', { dove: 'Ascensore 5 fino al Piano 5, poi a sinistra' }],
  ['plastica', 'Clinica di Chirurgia Plastica e Ricostruttiva', D, 'A', 5, '6', '', 'chirurgia plastica ricostruttiva ustioni', { dove: 'Linea verde fino all\'ascensore 6, Piano 5, poi a destra' }],
  // ---- Piano 6
  ['urologia', 'Clinica Urologica', D, 'T', 6, '1', '071 5963519', 'urologia', { dove: 'Corpo T, Piano 6. Ambulatori: linea verde a sinistra, ascensore 1. Accettazione ricoveri: ascensore 5' }],
  ['maxillo', 'Chirurgia Maxillo-Facciale', D, 'T', 6, '1', '071 5964544', 'chirurgia maxillo facciale', { dove: 'Corpo T, Piano 6. Ambulatori: ascensore 1. Accettazione ricoveri: ascensore 5. Visitatori: ascensore 4 fino al Piano 5' }],
  ['trauma-center', 'Trauma Center', SRV, 'E', 6, '6', '071 5965518', 'trauma center', { dove: 'Corpo E, Piano 6: ascensore 6, di fronte agli ambulatori di Otorinolaringoiatria' }],
  ['elisoccorso', 'Elisoccorso', SRV, 'E', 6, '6', '071 5964037', 'elisoccorso icaro 118', { dove: 'Corpo E, Piano 6: ascensore 6, di fronte agli ambulatori di Otorinolaringoiatria' }],
  ['orl-amb', 'Otorinolaringoiatria – Ambulatori', AMB, 'E', 6, '6', '071 5964041', 'otorinolaringoiatria orl otorino ambulatori'],
  ['pma', 'Medicina della Riproduzione (PMA)', AMB, 'C', 6, '5', '071 5966904', 'pma fecondazione assistita medicina riproduzione', { dove: 'Ascensore 5 fino al Piano 6 (a sinistra), oppure ascensore 6' }],
  ['genetica', 'Genetica Medica e Malattie Rare', AMB, 'C', 6, '5', '', 'genetica medica malattie rare'],
  ['allergologia', 'Allergologia', AMB, 'N', 6, '7', '071 5963245', 'allergologia allergie'],
  ['pneumologia', 'Pneumologia', D, 'L', 6, '7', '071 5964375', 'pneumologia polmoni respiratorio broncoscopia']
];

// ---------------------------------------------------------------- build

const label = Object.fromEntries(BLOCKS.map(([id, l]) => [id, l]));
const descr = Object.fromEntries(BLOCKS.map(([id, , , , d]) => [id, d]));
const ascById = Object.fromEntries(ASCENSORI.map((a) => [a.sigla, a]));

const reparti = REPARTI.map(([id, nome, tipo, corpo, piano, asc, tel, kw, extra = {}]) => {
  if (!label[corpo]) throw new Error(`${id}: corpo sconosciuto ${corpo}`);
  if (asc && !ascById[asc]) throw new Error(`${id}: ascensore sconosciuto ${asc}`);
  return {
    id: 'tor-' + id, nome, tipo, piano, corpo,
    ingresso: extra.ing || 'tor-ing-principale',
    ascensore: asc ? ascById[asc].id : null,
    dove: extra.dove || `${descr[corpo].split(' (')[0]}${asc ? ` – ascensore ${asc}` : ''}`,
    note: extra.note || '', tel, kw
  };
});
if (new Set(reparti.map((r) => r.id)).size !== reparti.length) throw new Error('id duplicati');

// Floors of each body: every floor from the lowest to the highest one known (wards, entrances, FLOORS).
const blocks = BLOCKS.map(([id, lab, colore, poly]) => {
  const known = [...reparti.filter((r) => r.corpo === id).map((r) => r.piano), ...INGRESSI.filter((i) => i.corpo === id).map((i) => i.piano), ...(FLOORS[id] || []), 0];
  const lo = Math.min(...known), hi = Math.max(...known);
  return { id, label: lab, colore, lv: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), poly };
});

// Roads (from OpenStreetMap, already in plan coordinates and kept clear of the blocks), width by kind.
const ROADS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'strade-torrette.json');
const WIDTH = { primary: 3.2, primary_link: 2.4, secondary: 3, tertiary: 2.6, tertiary_link: 2, residential: 2.4, unclassified: 2.2, service: 1.7 };
const strade = fs.existsSync(ROADS_FILE)
  ? JSON.parse(fs.readFileSync(ROADS_FILE, 'utf8')).roads.map((r) => ({ pts: r.pts, w: WIDTH[r.kind] || 2, ...(r.name ? { nome: r.name } : {}) }))
  : [];
// What the 2D plan shows: the blocks with some air around them (the roads go on beyond).
const allPts = BLOCKS.flatMap(([, , , poly]) => poly);
const view = { x0: Math.min(...allPts.map((p) => p[0])) - 6, y0: Math.min(...allPts.map((p) => p[1])) - 6, x1: Math.max(...allPts.map((p) => p[0])) + 6, y1: Math.max(...allPts.map((p) => p[1])) + 6 };

const data = {
  ospedali: [{
    id: 'torrette',
    nome: 'Ospedale di Torrette',
    citta: 'Ancona',
    indirizzo: 'Via Conca 71',
    foto: '/img/torrette.webp',
    avviso: 'Beta: disposizione dei reparti da verificare',
    uso_livelli: false,
    prefisso_tel: '',
    fonte: 'Reparti, piani e ascensori dal sito dell\'AOU delle Marche (novembre 2026). La mappa è uno schema non in scala: i corpi A, B, C, E, I, L, N seguono la pianta dell\'edificio originale, la posizione degli altri è indicativa. Strade e palazzina Malattie Infettive: © OpenStreetMap contributors. Da verificare sul posto.',
    piani: { min: -1, max: 6 },
    mappa: {
      tipo: 'pianta',
      unita: 'corpo',
      versione: 2,
      rot: -20,
      livelli: [-1, 0, 1, 2, 3, 4, 5, 6],
      view,
      blocks,
      corpi: Object.fromEntries(BLOCKS.map(([id, lab, , , d]) => [id, { label: lab, short: id === 'ATR' ? 'Atrio' : id, dove: d }])),
      decor: {
        strade,
        scritte: [
          { x: 18, y: 109, t: 'Ingresso principale · via Conca 71', cls: 'big' },
          { x: 100, y: 101, t: 'Pronto Soccorso', cls: 'red' }
        ]
      }
    },
    sedi: [{
      id: 'torrette-sede',
      nome: 'Presidio di Torrette',
      indirizzo: 'Via Conca 71, Torrette di Ancona',
      ingressi: INGRESSI,
      ascensori: ASCENSORI,
      reparti
    }]
  }]
};

fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
console.log(`${path.relative(process.cwd(), OUT)}: ${blocks.length} corpi, ${INGRESSI.length} ingressi, ${ASCENSORI.length} ascensori, ${reparti.length} reparti`);
