// Sano Doctor — Catálogos clínicos: CIE-10 frecuentes, vademécum, exámenes y reglas de apoyo clínico
import { normalize } from './utils.js';

// ======================================================================
// CIE-10: diagnósticos más frecuentes en medicina general / familiar
// ======================================================================
export const CIE10 = [
  ['J00', 'Rinofaringitis aguda (resfriado común)'], ['J01.9', 'Sinusitis aguda, no especificada'], ['J02.9', 'Faringitis aguda, no especificada'],
  ['J02.0', 'Faringitis estreptocócica'], ['J03.9', 'Amigdalitis aguda, no especificada'], ['J04.0', 'Laringitis aguda'], ['J06.9', 'Infección aguda de las vías respiratorias superiores'],
  ['J10.1', 'Influenza con otras manifestaciones respiratorias'], ['J11.1', 'Influenza, virus no identificado'], ['J18.9', 'Neumonía, no especificada'],
  ['J20.9', 'Bronquitis aguda, no especificada'], ['J30.4', 'Rinitis alérgica, no especificada'], ['J32.9', 'Sinusitis crónica'], ['J44.9', 'Enfermedad pulmonar obstructiva crónica'],
  ['J45.9', 'Asma, no especificada'], ['J45.0', 'Asma predominantemente alérgica'], ['U07.1', 'COVID-19, virus identificado'], ['H10.9', 'Conjuntivitis, no especificada'],
  ['H66.9', 'Otitis media, no especificada'], ['H60.9', 'Otitis externa, no especificada'], ['H61.2', 'Cerumen impactado'],
  ['I10', 'Hipertensión esencial (primaria)'], ['I11.9', 'Cardiopatía hipertensiva sin insuficiencia cardíaca'], ['I20.9', 'Angina de pecho, no especificada'],
  ['I25.1', 'Enfermedad aterosclerótica del corazón'], ['I48', 'Fibrilación y aleteo auricular'], ['I50.9', 'Insuficiencia cardíaca, no especificada'],
  ['I83.9', 'Venas varicosas de miembros inferiores'], ['I84.9', 'Hemorroides'], ['I95.9', 'Hipotensión, no especificada'],
  ['E11.9', 'Diabetes mellitus tipo 2 sin complicaciones'], ['E11.6', 'Diabetes mellitus tipo 2 con otras complicaciones'], ['E10.9', 'Diabetes mellitus tipo 1 sin complicaciones'],
  ['R73.0', 'Intolerancia a la glucosa (prediabetes)'], ['E03.9', 'Hipotiroidismo, no especificado'], ['E05.9', 'Tirotoxicosis (hipertiroidismo)'], ['E66.9', 'Obesidad, no especificada'],
  ['E66.0', 'Obesidad debida a exceso de calorías'], ['E78.5', 'Hiperlipidemia, no especificada'], ['E78.0', 'Hipercolesterolemia pura'], ['E78.1', 'Hipertrigliceridemia pura'],
  ['E79.0', 'Hiperuricemia sin signos de artritis'], ['M10.9', 'Gota, no especificada'], ['E55.9', 'Deficiencia de vitamina D'], ['E86', 'Deshidratación'],
  ['D50.9', 'Anemia por deficiencia de hierro'], ['D64.9', 'Anemia, no especificada'], ['E44.0', 'Desnutrición proteicocalórica moderada'],
  ['K21.9', 'Enfermedad por reflujo gastroesofágico'], ['K29.7', 'Gastritis, no especificada'], ['K30', 'Dispepsia funcional'], ['K25.9', 'Úlcera gástrica'],
  ['K52.9', 'Gastroenteritis y colitis no infecciosas'], ['A09', 'Diarrea y gastroenteritis de presunto origen infeccioso'], ['K58.9', 'Síndrome de intestino irritable'],
  ['K59.0', 'Estreñimiento'], ['K80.2', 'Cálculo de la vesícula biliar sin colecistitis'], ['K81.0', 'Colecistitis aguda'], ['K35.8', 'Apendicitis aguda'],
  ['K76.0', 'Hígado graso (esteatosis hepática)'], ['B82.9', 'Parasitosis intestinal, no especificada'], ['B86', 'Escabiosis'], ['B35.3', 'Tiña del pie'],
  ['B37.3', 'Candidiasis de la vulva y de la vagina'], ['B00.9', 'Infección por virus del herpes simple'], ['B01.9', 'Varicela sin complicaciones'], ['B02.9', 'Herpes zóster'],
  ['A90', 'Dengue'], ['A91', 'Dengue grave'], ['A92.0', 'Chikungunya'], ['B54', 'Paludismo (malaria), no especificado'], ['A15.0', 'Tuberculosis pulmonar'],
  ['N39.0', 'Infección de vías urinarias, sitio no especificado'], ['N30.0', 'Cistitis aguda'], ['N10', 'Pielonefritis aguda'], ['N20.0', 'Cálculo del riñón'],
  ['N23', 'Cólico renal, no especificado'], ['N40', 'Hiperplasia de la próstata'], ['N76.0', 'Vaginitis aguda'], ['N94.6', 'Dismenorrea, no especificada'],
  ['N92.0', 'Menstruación excesiva y frecuente'], ['N95.1', 'Estados menopáusicos y climatéricos'], ['Z30.0', 'Consejo y asesoramiento sobre anticoncepción'],
  ['Z34.9', 'Supervisión de embarazo normal'], ['O21.0', 'Hiperémesis gravídica leve'],
  ['M54.5', 'Lumbago no especificado'], ['M54.2', 'Cervicalgia'], ['M54.4', 'Lumbago con ciática'], ['M79.1', 'Mialgia'], ['M79.7', 'Fibromialgia'],
  ['M25.5', 'Dolor en articulación'], ['M17.9', 'Gonartrosis (artrosis de rodilla)'], ['M19.9', 'Artrosis, no especificada'], ['M06.9', 'Artritis reumatoide'],
  ['M75.1', 'Síndrome del manguito rotador'], ['M77.1', 'Epicondilitis lateral'], ['M65.9', 'Sinovitis y tenosinovitis'], ['S93.4', 'Esguince de tobillo'],
  ['S63.5', 'Esguince de muñeca'], ['T14.0', 'Traumatismo superficial'], ['T14.1', 'Herida de región no especificada'], ['T30.0', 'Quemadura, grado no especificado'],
  ['T78.4', 'Alergia no especificada'], ['T63.4', 'Picadura de insecto venenoso'], ['L50.9', 'Urticaria, no especificada'], ['L20.9', 'Dermatitis atópica'],
  ['L23.9', 'Dermatitis alérgica de contacto'], ['L30.9', 'Dermatitis, no especificada'], ['L70.0', 'Acné vulgar'], ['L02.9', 'Absceso cutáneo, furúnculo'],
  ['L03.9', 'Celulitis'], ['L01.0', 'Impétigo'], ['L60.0', 'Uña encarnada'], ['L21.9', 'Dermatitis seborreica'],
  ['G43.9', 'Migraña, no especificada'], ['G44.2', 'Cefalea tensional'], ['R51', 'Cefalea'], ['G47.0', 'Insomnio'], ['G40.9', 'Epilepsia, tipo no especificado'],
  ['G51.0', 'Parálisis de Bell'], ['G56.0', 'Síndrome del túnel carpiano'], ['R42', 'Mareo y desvanecimiento'], ['H81.1', 'Vértigo paroxístico benigno'], ['I63.9', 'Infarto cerebral'],
  ['F41.1', 'Trastorno de ansiedad generalizada'], ['F41.9', 'Trastorno de ansiedad, no especificado'], ['F32.9', 'Episodio depresivo, no especificado'], ['F43.2', 'Trastornos de adaptación'],
  ['F17.2', 'Dependencia de la nicotina'], ['F10.2', 'Dependencia del alcohol'],
  ['R50.9', 'Fiebre, no especificada'], ['R05', 'Tos'], ['R06.0', 'Disnea'], ['R07.4', 'Dolor torácico, no especificado'], ['R10.4', 'Dolor abdominal'],
  ['R11', 'Náusea y vómito'], ['R19.7', 'Diarrea, no especificada'], ['R53', 'Malestar y fatiga'], ['R63.4', 'Pérdida anormal de peso'], ['R60.0', 'Edema localizado'],
  ['R31', 'Hematuria, no especificada'], ['R21', 'Erupción cutánea'], ['R55', 'Síncope y colapso'], ['R00.0', 'Taquicardia, no especificada'],
  ['Z00.0', 'Examen médico general'], ['Z00.1', 'Control de salud de rutina del niño'], ['Z02.7', 'Expedición de certificado médico'], ['Z02.5', 'Examen para participación en deportes'],
  ['Z01.4', 'Examen ginecológico general'], ['Z23', 'Necesidad de inmunización'], ['Z71.3', 'Consulta para instrucción y vigilancia de la dieta'], ['Z76.0', 'Consulta para repetición de receta'],
  ['Z09', 'Examen de seguimiento consecutivo a tratamiento'], ['Z13.1', 'Pesquisa especial para diabetes'], ['Z72.0', 'Problemas relacionados con el uso de tabaco']
].map(([code, name]) => ({ code, name }));

export function searchCIE(q, max = 12) {
  const t = normalize(q).trim();
  if (!t) return [];
  const words = t.split(/\s+/);
  return CIE10.filter((d) => { const h = normalize(`${d.code} ${d.name}`); return words.every((w) => h.includes(w)); })
    .sort((a, b) => (normalize(a.code).startsWith(t) ? -1 : 0) - (normalize(b.code).startsWith(t) ? -1 : 0))
    .slice(0, max);
}

// ======================================================================
// VADEMÉCUM: genéricos de uso frecuente con posología sugerida para adultos
// [nombre, presentación, dosis, frecuencia, duración, vía, familia]
// ======================================================================
const M = (name, presentation, dose, frequency, duration, route = 'Oral', family = '') => ({ name, presentation, dose, frequency, duration, route, family });
export const MEDS = [
  M('Acetaminofén', 'Tabletas 500 mg', '1 tableta', 'cada 8 horas', '3 días', 'Oral'),
  M('Acetaminofén', 'Tabletas 650 mg', '1 tableta', 'cada 8 horas', '3 días', 'Oral'),
  M('Acetaminofén', 'Jarabe 120 mg/5 ml', '10 ml', 'cada 8 horas', '3 días', 'Oral'),
  M('Ibuprofeno', 'Tabletas 400 mg', '1 tableta', 'cada 8 horas con comida', '5 días', 'Oral', 'aines'),
  M('Ibuprofeno', 'Tabletas 600 mg', '1 tableta', 'cada 12 horas con comida', '5 días', 'Oral', 'aines'),
  M('Diclofenac sódico', 'Tabletas 50 mg', '1 tableta', 'cada 12 horas con comida', '5 días', 'Oral', 'aines'),
  M('Diclofenac sódico', 'Ampolla 75 mg/3 ml', '1 ampolla', 'dosis única', '1 día', 'Intramuscular', 'aines'),
  M('Naproxeno', 'Tabletas 500 mg', '1 tableta', 'cada 12 horas con comida', '5 días', 'Oral', 'aines'),
  M('Ketoprofeno', 'Cápsulas 100 mg', '1 cápsula', 'cada 12 horas', '5 días', 'Oral', 'aines'),
  M('Ketorolaco', 'Tabletas 10 mg', '1 tableta', 'cada 8 horas', '3 días', 'Oral', 'aines'),
  M('Ácido acetilsalicílico', 'Tabletas 81 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral', 'aspirina'),
  M('Metamizol (dipirona)', 'Tabletas 500 mg', '1 tableta', 'cada 8 horas si hay dolor', '3 días', 'Oral', 'dipirona'),
  M('Tramadol', 'Cápsulas 50 mg', '1 cápsula', 'cada 8 horas si hay dolor', '3 días', 'Oral'),
  M('Amoxicilina', 'Cápsulas 500 mg', '1 cápsula', 'cada 8 horas', '7 días', 'Oral', 'penicilina'),
  M('Amoxicilina', 'Suspensión 250 mg/5 ml', 'según peso', 'cada 8 horas', '7 días', 'Oral', 'penicilina'),
  M('Amoxicilina + ácido clavulánico', 'Tabletas 875/125 mg', '1 tableta', 'cada 12 horas', '7 días', 'Oral', 'penicilina'),
  M('Penicilina benzatínica', 'Frasco 2.400.000 UI', '1 frasco', 'dosis única', '1 día', 'Intramuscular', 'penicilina'),
  M('Ampicilina', 'Cápsulas 500 mg', '1 cápsula', 'cada 6 horas', '7 días', 'Oral', 'penicilina'),
  M('Cefalexina', 'Cápsulas 500 mg', '1 cápsula', 'cada 6 horas', '7 días', 'Oral', 'cefalosporina'),
  M('Cefadroxilo', 'Cápsulas 500 mg', '1 cápsula', 'cada 12 horas', '7 días', 'Oral', 'cefalosporina'),
  M('Cefuroxima', 'Tabletas 500 mg', '1 tableta', 'cada 12 horas', '7 días', 'Oral', 'cefalosporina'),
  M('Ceftriaxona', 'Ampolla 1 g', '1 g', 'cada 24 horas', '3 días', 'Intramuscular', 'cefalosporina'),
  M('Azitromicina', 'Tabletas 500 mg', '1 tableta', 'una vez al día', '3 días', 'Oral', 'macrolido'),
  M('Claritromicina', 'Tabletas 500 mg', '1 tableta', 'cada 12 horas', '7 días', 'Oral', 'macrolido'),
  M('Ciprofloxacina', 'Tabletas 500 mg', '1 tableta', 'cada 12 horas', '7 días', 'Oral', 'quinolona'),
  M('Levofloxacina', 'Tabletas 500 mg', '1 tableta', 'una vez al día', '7 días', 'Oral', 'quinolona'),
  M('Trimetoprim-sulfametoxazol', 'Tabletas 160/800 mg', '1 tableta', 'cada 12 horas', '7 días', 'Oral', 'sulfa'),
  M('Nitrofurantoína', 'Cápsulas 100 mg', '1 cápsula', 'cada 12 horas', '5 días', 'Oral'),
  M('Fosfomicina', 'Sobre 3 g', '1 sobre disuelto en agua', 'dosis única en la noche', '1 día', 'Oral'),
  M('Doxiciclina', 'Cápsulas 100 mg', '1 cápsula', 'cada 12 horas', '7 días', 'Oral'),
  M('Metronidazol', 'Tabletas 500 mg', '1 tableta', 'cada 8 horas', '7 días', 'Oral'),
  M('Clindamicina', 'Cápsulas 300 mg', '1 cápsula', 'cada 8 horas', '7 días', 'Oral'),
  M('Nitazoxanida', 'Tabletas 500 mg', '1 tableta', 'cada 12 horas', '3 días', 'Oral'),
  M('Albendazol', 'Tabletas 400 mg', '1 tableta', 'dosis única', '1 día', 'Oral'),
  M('Mebendazol', 'Tabletas 100 mg', '1 tableta', 'cada 12 horas', '3 días', 'Oral'),
  M('Fluconazol', 'Cápsulas 150 mg', '1 cápsula', 'dosis única', '1 día', 'Oral'),
  M('Clotrimazol', 'Crema 1%', 'aplicar capa fina', 'cada 12 horas', '14 días', 'Tópica'),
  M('Aciclovir', 'Tabletas 400 mg', '1 tableta', 'cada 8 horas', '7 días', 'Oral'),
  M('Ivermectina', 'Tabletas 6 mg', 'según peso', 'dosis única', '1 día', 'Oral'),
  M('Permetrina', 'Loción 5%', 'aplicar en todo el cuerpo', 'en la noche, repetir a los 7 días', '7 días', 'Tópica'),
  M('Loratadina', 'Tabletas 10 mg', '1 tableta', 'una vez al día', '7 días', 'Oral'),
  M('Desloratadina', 'Tabletas 5 mg', '1 tableta', 'una vez al día', '7 días', 'Oral'),
  M('Cetirizina', 'Tabletas 10 mg', '1 tableta', 'en la noche', '7 días', 'Oral'),
  M('Clorfeniramina', 'Tabletas 4 mg', '1 tableta', 'cada 8 horas', '5 días', 'Oral'),
  M('Difenhidramina', 'Ampolla 50 mg', '1 ampolla', 'dosis única', '1 día', 'Intramuscular'),
  M('Prednisona', 'Tabletas 20 mg', '1 tableta', 'en la mañana', '5 días', 'Oral'),
  M('Prednisona', 'Tabletas 5 mg', '1 tableta', 'en la mañana', '5 días', 'Oral'),
  M('Dexametasona', 'Ampolla 8 mg/2 ml', '1 ampolla', 'dosis única', '1 día', 'Intramuscular'),
  M('Betametasona', 'Ampolla 4 mg/ml', '1 ampolla', 'dosis única', '1 día', 'Intramuscular'),
  M('Hidrocortisona', 'Crema 1%', 'aplicar capa fina', 'cada 12 horas', '7 días', 'Tópica'),
  M('Salbutamol', 'Inhalador 100 mcg/dosis', '2 inhalaciones', 'cada 6 horas si hay falta de aire', '7 días', 'Inhalada'),
  M('Salbutamol', 'Solución para nebulizar 5 mg/ml', '10 gotas en 3 ml de solución fisiológica', 'cada 6 horas', '3 días', 'Inhalada'),
  M('Budesonida', 'Inhalador 200 mcg/dosis', '1 inhalación', 'cada 12 horas', '30 días', 'Inhalada'),
  M('Bromuro de ipratropio', 'Inhalador 20 mcg/dosis', '2 inhalaciones', 'cada 8 horas', '7 días', 'Inhalada'),
  M('Montelukast', 'Tabletas 10 mg', '1 tableta', 'en la noche', '30 días', 'Oral'),
  M('Ambroxol', 'Jarabe 30 mg/5 ml', '10 ml', 'cada 8 horas', '5 días', 'Oral'),
  M('Acetilcisteína', 'Sobre 600 mg', '1 sobre disuelto en agua', 'una vez al día', '7 días', 'Oral'),
  M('Dextrometorfano', 'Jarabe 15 mg/5 ml', '10 ml', 'cada 8 horas', '5 días', 'Oral'),
  M('Oximetazolina', 'Gotas nasales 0,05%', '2 gotas en cada fosa', 'cada 12 horas', '3 días', 'Nasal'),
  M('Solución fisiológica nasal', 'Spray 0,9%', '2 aplicaciones en cada fosa', 'cada 6 horas', '7 días', 'Nasal'),
  M('Fluticasona nasal', 'Spray 50 mcg', '2 aplicaciones en cada fosa', 'una vez al día', '30 días', 'Nasal'),
  M('Omeprazol', 'Cápsulas 20 mg', '1 cápsula', 'en ayunas', '30 días', 'Oral'),
  M('Esomeprazol', 'Tabletas 40 mg', '1 tableta', 'en ayunas', '30 días', 'Oral'),
  M('Pantoprazol', 'Tabletas 40 mg', '1 tableta', 'en ayunas', '30 días', 'Oral'),
  M('Ranitidina', 'Tabletas 150 mg', '1 tableta', 'cada 12 horas', '14 días', 'Oral'),
  M('Hidróxido de aluminio y magnesio', 'Suspensión', '10 ml', 'después de cada comida', '7 días', 'Oral'),
  M('Metoclopramida', 'Tabletas 10 mg', '1 tableta', '30 min antes de cada comida', '5 días', 'Oral'),
  M('Domperidona', 'Tabletas 10 mg', '1 tableta', '30 min antes de cada comida', '5 días', 'Oral'),
  M('Ondansetrón', 'Tabletas 8 mg', '1 tableta', 'cada 12 horas si hay vómito', '3 días', 'Oral'),
  M('Butilbromuro de hioscina', 'Tabletas 10 mg', '1 tableta', 'cada 8 horas si hay cólico', '3 días', 'Oral'),
  M('Simeticona', 'Tabletas 80 mg', '1 tableta', 'después de cada comida', '7 días', 'Oral'),
  M('Loperamida', 'Tabletas 2 mg', '2 tabletas y luego 1 tras cada evacuación', 'máximo 8 al día', '2 días', 'Oral'),
  M('Sales de rehidratación oral', 'Sobres', '1 sobre en 1 litro de agua', 'tomar a libre demanda', '3 días', 'Oral'),
  M('Lactobacilos / probióticos', 'Sobres', '1 sobre', 'una vez al día', '7 días', 'Oral'),
  M('Lactulosa', 'Jarabe 3,3 g/5 ml', '15 ml', 'en la noche', '7 días', 'Oral'),
  M('Losartán potásico', 'Tabletas 50 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Losartán potásico', 'Tabletas 100 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Enalapril', 'Tabletas 10 mg', '1 tableta', 'cada 12 horas', 'Continuo', 'Oral'),
  M('Amlodipino', 'Tabletas 5 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Amlodipino', 'Tabletas 10 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Valsartán', 'Tabletas 160 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Hidroclorotiazida', 'Tabletas 25 mg', '1 tableta', 'en la mañana', 'Continuo', 'Oral', 'sulfa'),
  M('Furosemida', 'Tabletas 40 mg', '1 tableta', 'en la mañana', '7 días', 'Oral', 'sulfa'),
  M('Espironolactona', 'Tabletas 25 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Carvedilol', 'Tabletas 6,25 mg', '1 tableta', 'cada 12 horas', 'Continuo', 'Oral'),
  M('Atenolol', 'Tabletas 50 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Bisoprolol', 'Tabletas 5 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Atorvastatina', 'Tabletas 20 mg', '1 tableta', 'en la noche', 'Continuo', 'Oral'),
  M('Rosuvastatina', 'Tabletas 10 mg', '1 tableta', 'en la noche', 'Continuo', 'Oral'),
  M('Gemfibrozilo', 'Tabletas 600 mg', '1 tableta', 'cada 12 horas antes de comer', 'Continuo', 'Oral'),
  M('Clopidogrel', 'Tabletas 75 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Metformina', 'Tabletas 500 mg', '1 tableta', 'con almuerzo y cena', 'Continuo', 'Oral'),
  M('Metformina', 'Tabletas 850 mg', '1 tableta', 'cada 12 horas con comida', 'Continuo', 'Oral'),
  M('Glibenclamida', 'Tabletas 5 mg', '1 tableta', 'antes del desayuno', 'Continuo', 'Oral', 'sulfa'),
  M('Glimepirida', 'Tabletas 2 mg', '1 tableta', 'antes del desayuno', 'Continuo', 'Oral', 'sulfa'),
  M('Sitagliptina', 'Tabletas 100 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Insulina NPH', 'Frasco 100 UI/ml', 'según esquema', 'antes del desayuno y la cena', 'Continuo', 'Subcutánea'),
  M('Insulina glargina', 'Pluma 100 UI/ml', 'según esquema', 'una vez al día', 'Continuo', 'Subcutánea'),
  M('Levotiroxina', 'Tabletas 50 mcg', '1 tableta', 'en ayunas', 'Continuo', 'Oral'),
  M('Levotiroxina', 'Tabletas 100 mcg', '1 tableta', 'en ayunas', 'Continuo', 'Oral'),
  M('Alopurinol', 'Tabletas 300 mg', '1 tableta', 'una vez al día', 'Continuo', 'Oral'),
  M('Colchicina', 'Tabletas 0,5 mg', '1 tableta', 'cada 12 horas', '7 días', 'Oral'),
  M('Sulfato ferroso', 'Tabletas 300 mg', '1 tableta', 'en ayunas con jugo cítrico', '90 días', 'Oral'),
  M('Ácido fólico', 'Tabletas 5 mg', '1 tableta', 'una vez al día', '90 días', 'Oral'),
  M('Complejo B', 'Tabletas', '1 tableta', 'una vez al día', '30 días', 'Oral'),
  M('Vitamina D3', 'Cápsulas 50.000 UI', '1 cápsula', 'una vez a la semana', '8 semanas', 'Oral'),
  M('Calcio + vitamina D', 'Tabletas 600 mg/400 UI', '1 tableta', 'una vez al día', '90 días', 'Oral'),
  M('Vitamina C', 'Tabletas 500 mg', '1 tableta', 'una vez al día', '15 días', 'Oral'),
  M('Zinc', 'Tabletas 20 mg', '1 tableta', 'una vez al día', '10 días', 'Oral'),
  M('Polivitamínico prenatal', 'Cápsulas', '1 cápsula', 'una vez al día', 'Continuo', 'Oral'),
  M('Sertralina', 'Tabletas 50 mg', '1 tableta', 'en la mañana', '30 días', 'Oral'),
  M('Fluoxetina', 'Cápsulas 20 mg', '1 cápsula', 'en la mañana', '30 días', 'Oral'),
  M('Escitalopram', 'Tabletas 10 mg', '1 tableta', 'en la mañana', '30 días', 'Oral'),
  M('Alprazolam', 'Tabletas 0,25 mg', '1 tableta', 'en la noche', '15 días', 'Oral'),
  M('Clonazepam', 'Tabletas 0,5 mg', '1 tableta', 'en la noche', '15 días', 'Oral'),
  M('Amitriptilina', 'Tabletas 25 mg', '1 tableta', 'en la noche', '30 días', 'Oral'),
  M('Pregabalina', 'Cápsulas 75 mg', '1 cápsula', 'cada 12 horas', '30 días', 'Oral'),
  M('Carbamazepina', 'Tabletas 200 mg', '1 tableta', 'cada 12 horas', 'Continuo', 'Oral'),
  M('Ácido valproico', 'Tabletas 500 mg', '1 tableta', 'cada 12 horas', 'Continuo', 'Oral'),
  M('Betahistina', 'Tabletas 16 mg', '1 tableta', 'cada 8 horas', '15 días', 'Oral'),
  M('Dimenhidrinato', 'Tabletas 50 mg', '1 tableta', 'cada 8 horas si hay mareo', '3 días', 'Oral'),
  M('Ciclobenzaprina', 'Tabletas 10 mg', '1 tableta', 'en la noche', '7 días', 'Oral'),
  M('Tiocolchicósido', 'Cápsulas 4 mg', '1 cápsula', 'cada 12 horas', '5 días', 'Oral'),
  M('Diclofenac gel', 'Gel 1%', 'aplicar en la zona', 'cada 8 horas', '7 días', 'Tópica', 'aines'),
  M('Mupirocina', 'Ungüento 2%', 'aplicar en la lesión', 'cada 8 horas', '7 días', 'Tópica'),
  M('Ácido fusídico', 'Crema 2%', 'aplicar en la lesión', 'cada 8 horas', '7 días', 'Tópica'),
  M('Sulfadiazina de plata', 'Crema 1%', 'aplicar en la quemadura', 'cada 12 horas con cura', '10 días', 'Tópica', 'sulfa'),
  M('Tobramicina oftálmica', 'Gotas 0,3%', '1 gota en cada ojo', 'cada 6 horas', '7 días', 'Oftálmica'),
  M('Lágrimas artificiales', 'Gotas', '1 gota en cada ojo', 'cada 6 horas', '30 días', 'Oftálmica'),
  M('Ciprofloxacina ótica', 'Gotas óticas', '3 gotas en el oído afectado', 'cada 12 horas', '7 días', 'Ótica', 'quinolona'),
  M('Tamsulosina', 'Cápsulas 0,4 mg', '1 cápsula', 'en la noche', '30 días', 'Oral'),
  M('Fenazopiridina', 'Tabletas 100 mg', '1 tableta', 'cada 8 horas', '2 días', 'Oral'),
  M('Óvulos de clotrimazol', 'Óvulos 100 mg', '1 óvulo vaginal', 'en la noche', '6 días', 'Vaginal'),
  M('Metronidazol óvulos', 'Óvulos 500 mg', '1 óvulo vaginal', 'en la noche', '7 días', 'Vaginal'),
  M('Anticonceptivo oral combinado', 'Tabletas', '1 tableta', 'una vez al día a la misma hora', 'Continuo', 'Oral'),
  M('Sildenafil', 'Tabletas 50 mg', '1 tableta', '1 hora antes si se requiere', 'Según necesidad', 'Oral'),
  M('Nicotina parches', 'Parche 21 mg', '1 parche', 'cambiar cada 24 horas', '4 semanas', 'Transdérmica'),
  M('Solución fisiológica 0,9%', 'Bolsa 500 ml', '500 ml', 'pasar en 1 hora', '1 día', 'Intravenosa')
];
MEDS.forEach((m, i) => { m.id = 'm' + i; });

export const ROUTES_ADMIN = ['Oral', 'Sublingual', 'Intramuscular', 'Intravenosa', 'Subcutánea', 'Tópica', 'Inhalada', 'Nasal', 'Oftálmica', 'Ótica', 'Vaginal', 'Rectal', 'Transdérmica'];
export const FREQUENCIES = ['cada 4 horas', 'cada 6 horas', 'cada 8 horas', 'cada 12 horas', 'una vez al día', 'en la mañana', 'en la noche', 'en ayunas', 'antes de cada comida', 'después de cada comida', 'dosis única', 'si hay dolor o fiebre'];
export const DURATIONS = ['1 día', '3 días', '5 días', '7 días', '10 días', '14 días', '30 días', '90 días', 'Continuo'];

export function searchMeds(q, max = 14, favs = []) {
  const t = normalize(q).trim();
  const all = [...favs.map((f) => ({ ...f, fav: true })), ...MEDS];
  if (!t) return favs.length ? all.slice(0, max) : [];
  const words = t.split(/\s+/);
  const seen = new Set();
  return all.filter((m) => {
    const key = normalize(`${m.name} ${m.presentation}`);
    if (seen.has(key)) return false;
    const ok = words.every((w) => key.includes(w));
    if (ok) seen.add(key);
    return ok;
  }).slice(0, max);
}

// ======================================================================
// ALERGIAS: un medicamento que pertenece a una familia a la que el paciente es alérgico
// ======================================================================
const ALLERGY_FAMILIES = {
  penicilina: ['penicilina', 'amoxicilina', 'ampicilina', 'dicloxacilina', 'oxacilina', 'piperacilina', 'clavulan'],
  cefalosporina: ['cefalosporina', 'cefalexina', 'cefadroxilo', 'cefuroxima', 'ceftriaxona', 'cefixima', 'cefazolina'],
  sulfa: ['sulfa', 'sulfametoxazol', 'sulfadiazina', 'trimetoprim-sulfa', 'furosemida', 'hidroclorotiazida', 'glibenclamida', 'glimepirida'],
  aines: ['aines', 'ibuprofeno', 'diclofenac', 'naproxeno', 'ketoprofeno', 'ketorolaco', 'meloxicam', 'piroxicam', 'aspirina', 'acetilsalicilico', 'nimesulida'],
  aspirina: ['aspirina', 'acetilsalicilico'],
  quinolona: ['quinolona', 'ciprofloxacina', 'levofloxacina', 'moxifloxacina', 'norfloxacina'],
  dipirona: ['dipirona', 'metamizol'],
  macrolido: ['macrolido', 'azitromicina', 'claritromicina', 'eritromicina']
};
const ALLERGY_KEY = { penicilina: 'penicilina', penicilinas: 'penicilina', cefalosporinas: 'cefalosporina', cefalosporina: 'cefalosporina', sulfas: 'sulfa', sulfa: 'sulfa', sulfonamidas: 'sulfa', aines: 'aines', aspirina: 'aspirina', quinolonas: 'quinolona', dipirona: 'dipirona', metamizol: 'dipirona', macrolidos: 'macrolido' };

/** Devuelve la alergia del paciente con la que choca el medicamento, o null */
export function allergyConflict(med, allergies = []) {
  const name = normalize(`${med.name} ${med.family || ''}`);
  for (const a of allergies) {
    const an = normalize(a).replace(/[^a-z0-9 ]/g, ' ').trim();
    if (!an) continue;
    const fam = ALLERGY_KEY[an.split(' ')[0]] || ALLERGY_KEY[an];
    const words = fam ? ALLERGY_FAMILIES[fam] : [an];
    if (words.some((w) => w.length > 3 && name.includes(w))) return a;
    if (fam && med.family === fam) return a;
  }
  return null;
}

// ======================================================================
// EXÁMENES
// ======================================================================
export const LAB_GROUPS = {
  'Hematología': ['Hematología completa', 'Velocidad de sedimentación (VSG)', 'Reticulocitos', 'Frotis de sangre periférica', 'Grupo sanguíneo y factor Rh', 'Tiempo de protrombina (PT)', 'Tiempo parcial de tromboplastina (PTT)', 'Fibrinógeno'],
  'Química sanguínea': ['Glicemia en ayunas', 'Glicemia postprandial', 'Hemoglobina glicosilada (HbA1c)', 'Prueba de tolerancia a la glucosa', 'Urea', 'Creatinina', 'Ácido úrico', 'Perfil lipídico', 'Colesterol total', 'Triglicéridos', 'Proteínas totales y fraccionadas', 'Bilirrubina total y fraccionada', 'TGO (AST)', 'TGP (ALT)', 'Fosfatasa alcalina', 'Amilasa', 'Lipasa', 'Electrolitos (Na, K, Cl)', 'Calcio', 'Magnesio', 'Ferritina', 'Hierro sérico', 'Vitamina B12', 'Vitamina D (25-OH)'],
  'Hormonas': ['TSH', 'T4 libre', 'T3 libre', 'PSA total', 'PSA libre', 'Beta HCG cuantitativa', 'Insulina basal', 'Prolactina', 'FSH', 'LH', 'Estradiol', 'Progesterona', 'Cortisol'],
  'Inmunología e infecciosas': ['Proteína C reactiva (PCR)', 'Factor reumatoideo', 'Antiestreptolisina O (ASTO)', 'VDRL', 'VIH (prueba rápida / ELISA)', 'Hepatitis B (HBsAg)', 'Hepatitis C (anti-HCV)', 'Dengue NS1 / IgM-IgG', 'Prueba COVID-19 (antígeno)', 'Gota gruesa (malaria)', 'Toxoplasmosis IgG/IgM', 'Helicobacter pylori'],
  'Orina y heces': ['Uroanálisis', 'Urocultivo con antibiograma', 'Microalbuminuria', 'Proteinuria de 24 horas', 'Coproanálisis (heces)', 'Sangre oculta en heces', 'Coprocultivo'],
  'Otros': ['Exudado faríngeo', 'Citología vaginal (Papanicolaou)', 'Secreción vaginal', 'Espermatograma', 'Electrocardiograma']
};
export const IMAGING = ['Rx de tórax PA y lateral', 'Rx de columna lumbosacra', 'Rx de columna cervical', 'Rx de rodilla', 'Rx de senos paranasales', 'Rx de mano / muñeca', 'Rx de tobillo', 'Ecografía abdominal', 'Ecografía pélvica', 'Ecografía transvaginal', 'Ecografía renal y vías urinarias', 'Ecografía prostática', 'Ecografía tiroidea', 'Ecografía mamaria', 'Ecografía obstétrica', 'Ecocardiograma', 'Mamografía', 'Densitometría ósea', 'Tomografía de cráneo', 'Tomografía de tórax', 'Resonancia magnética de columna', 'Holter de 24 horas', 'MAPA (monitoreo de presión 24 h)', 'Prueba de esfuerzo', 'Espirometría'];
export const SPECIALTIES = ['Cardiología', 'Endocrinología', 'Gastroenterología', 'Neumonología', 'Nefrología', 'Neurología', 'Ginecología y obstetricia', 'Urología', 'Traumatología', 'Dermatología', 'Oftalmología', 'Otorrinolaringología', 'Pediatría', 'Psiquiatría', 'Psicología', 'Reumatología', 'Medicina interna', 'Cirugía general', 'Nutrición', 'Fisiatría / fisioterapia', 'Odontología', 'Oncología', 'Hematología', 'Infectología', 'Emergencia'];

// ======================================================================
// SIGNOS VITALES: cálculos y alertas
// ======================================================================
export const VITALS = [
  ['ta', 'Tensión arterial', 'mmHg', '120/80'], ['fc', 'Frecuencia cardíaca', 'lpm', '72'], ['fr', 'Frecuencia respiratoria', 'rpm', '16'],
  ['temp', 'Temperatura', '°C', '36,5'], ['sat', 'Saturación O₂', '%', '98'], ['peso', 'Peso', 'kg', '70'], ['talla', 'Talla', 'cm', '170'],
  ['glucemia', 'Glicemia capilar', 'mg/dl', '95'], ['cintura', 'Circunferencia abdominal', 'cm', '88']
];

export function parseTA(v) {
  const m = String(v || '').match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
  return m ? { s: +m[1], d: +m[2] } : null;
}
const n = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : null; };

export function bmi(vitals = {}) {
  const w = n(vitals.peso); const h = n(vitals.talla);
  if (!w || !h) return null;
  const m = h > 3 ? h / 100 : h;
  if (m < 0.4 || m > 2.5 || w > 400) return null; // dato mal escrito: lo avisa vitalAlerts
  const v = Math.round((w / (m * m)) * 10) / 10;
  const cat = v < 18.5 ? ['Bajo peso', 'warning'] : v < 25 ? ['Peso normal', 'success'] : v < 30 ? ['Sobrepeso', 'warning'] : v < 35 ? ['Obesidad grado I', 'danger'] : v < 40 ? ['Obesidad grado II', 'danger'] : ['Obesidad grado III', 'danger'];
  return { value: v, label: cat[0], tone: cat[1] };
}

export function taClass(v) {
  const t = parseTA(v);
  if (!t) return null;
  if (t.s >= 180 || t.d >= 120) return { label: 'Crisis hipertensiva', tone: 'danger' };
  if (t.s >= 140 || t.d >= 90) return { label: 'HTA grado 2', tone: 'danger' };
  if (t.s >= 130 || t.d >= 80) return { label: 'HTA grado 1', tone: 'warning' };
  if (t.s >= 120) return { label: 'Elevada', tone: 'warning' };
  if (t.s < 90 || t.d < 60) return { label: 'Hipotensión', tone: 'warning' };
  return { label: 'Normal', tone: 'success' };
}

/** Lista de alertas por valores fuera de rango (adulto) */
export function vitalAlerts(v = {}, age = null) {
  const out = [];
  const ta = taClass(v.ta); if (ta && ta.tone !== 'success') out.push({ k: 'ta', text: `TA ${v.ta}: ${ta.label}`, tone: ta.tone });
  const fc = n(v.fc); if (fc != null && age != null && age >= 12) { if (fc > 100) out.push({ k: 'fc', text: `Taquicardia (${fc} lpm)`, tone: 'warning' }); if (fc < 50) out.push({ k: 'fc', text: `Bradicardia (${fc} lpm)`, tone: 'warning' }); }
  const fr = n(v.fr); if (fr != null && age != null && age >= 12 && fr > 22) out.push({ k: 'fr', text: `Taquipnea (${fr} rpm)`, tone: 'warning' });
  const t = n(v.temp); if (t != null) { if (t >= 39) out.push({ k: 'temp', text: `Fiebre alta (${t} °C)`, tone: 'danger' }); else if (t >= 38) out.push({ k: 'temp', text: `Fiebre (${t} °C)`, tone: 'warning' }); else if (t >= 37.5) out.push({ k: 'temp', text: `Febrícula (${t} °C)`, tone: 'warning' }); else if (t < 35.5) out.push({ k: 'temp', text: `Hipotermia (${t} °C)`, tone: 'danger' }); }
  const s = n(v.sat); if (s != null) { if (s < 90) out.push({ k: 'sat', text: `Saturación muy baja (${s}%)`, tone: 'danger' }); else if (s < 94) out.push({ k: 'sat', text: `Saturación baja (${s}%)`, tone: 'warning' }); }
  const g = n(v.glucemia); if (g != null) { if (g < 70) out.push({ k: 'glucemia', text: `Hipoglicemia (${g} mg/dl)`, tone: 'danger' }); else if (g >= 250) out.push({ k: 'glucemia', text: `Hiperglicemia severa (${g} mg/dl)`, tone: 'danger' }); else if (g >= 180) out.push({ k: 'glucemia', text: `Hiperglicemia (${g} mg/dl)`, tone: 'warning' }); }
  const h = n(v.talla); if (h != null && ((h > 3 ? h / 100 : h) < 0.4 || (h > 3 ? h / 100 : h) > 2.5)) out.push({ k: 'talla', text: `Revisa la talla (${v.talla} cm)`, tone: 'warning' });
  const w = n(v.peso); if (w != null && (w <= 0 || w > 400)) out.push({ k: 'peso', text: `Revisa el peso (${v.peso} kg)`, tone: 'warning' });
  const b = bmi(v); if (b && b.tone !== 'success') out.push({ k: 'imc', text: `IMC ${b.value}: ${b.label}`, tone: b.tone });
  return out;
}

// ======================================================================
// EDAD
// ======================================================================
export function ageOf(birthDate, at = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate + 'T12:00');
  if (isNaN(b)) return null;
  let a = at.getFullYear() - b.getFullYear();
  const mm = at.getMonth() - b.getMonth();
  if (mm < 0 || (mm === 0 && at.getDate() < b.getDate())) a--;
  return a;
}
export function ageText(birthDate, at = new Date()) {
  if (!birthDate) return '';
  const b = new Date(birthDate + 'T12:00');
  if (isNaN(b)) return '';
  const months = (at.getFullYear() - b.getFullYear()) * 12 + at.getMonth() - b.getMonth() - (at.getDate() < b.getDate() ? 1 : 0);
  if (months < 1) return `${Math.max(0, Math.floor((at - b) / 864e5))} días`;
  if (months < 24) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  return `${Math.floor(months / 12)} años`;
}

/** Plantillas de examen físico por sistemas (texto inicial editable) */
export const EXAM_TEMPLATE = 'Paciente en buenas condiciones generales, consciente, orientado, hidratado, afebril al tacto.\nPiel y mucosas: normocoloreadas, hidratadas.\nCabeza y cuello: sin adenopatías, tiroides no palpable.\nCardiopulmonar: ruidos cardíacos rítmicos, sin soplos. Murmullo vesicular audible en ambos campos, sin agregados.\nAbdomen: blando, depresible, no doloroso, ruidos hidroaéreos presentes.\nExtremidades: simétricas, sin edema.\nNeurológico: sin déficit motor ni sensitivo aparente.';
