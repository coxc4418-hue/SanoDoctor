<div align="center">

<img src="LOGO_SANO_DOCTOR.png" alt="Sano Doctor" width="140">

# Sano Doctor
**Gestión médica para consultorios de medicina general** · https://sano-doctor.web.app

</div>

PWA multisede (20 sedes + administrador) hecha con JavaScript puro (sin compilación) y Firebase (Auth, Firestore, Hosting).

## Funciones
- **Inicio**: sala de espera, agenda del día, cobrado / por cobrar, recordatorios de mañana, cumpleaños, insumos bajos o por vencer.
- **Agenda**: día, semana y próximas; horario con descanso y sábados; horas libres sugeridas; choques y sobrecupos; confirmar, llegó, no asistió, cancelar, reprogramar; WhatsApp.
- **Pacientes**: historia (HC-0001), cédula sin duplicados, antecedentes, alergias, crónicos, hábitos, gineco-obstétricos, vacunas, seguro, archivos, signos vitales con gráficas, importar/exportar CSV.
- **Consulta**: motivo, enfermedad actual, signos vitales con alertas (TA, fiebre, SpO₂, glicemia, IMC), examen físico con plantilla, CIE-10, plan, récipe con vademécum, favoritos y **aviso de alergias**, exámenes de laboratorio e imágenes, referencia, documentos. Guardado automático.
- **Documentos con QR verificable** (`/verificar/CÓDIGO`): récipe e indicaciones, orden de exámenes, reposo, constancia de asistencia, certificado de salud, informe médico, referencia, historia clínica. Se pueden anular.
- **Cierre y cobro**: servicios + insumos usados (descuentan inventario), cobrar ahora, dejar por cobrar o cortesía, control agendado automáticamente.
- **Cobrar**, **Facturación** (anulación con PIN), **Caja** por turnos ($ y Bs, tasa BCV automática), **Insumos y medicinas** (lotes y vencimientos), **Reportes** (PIN), **Configuración** (médicos con MPPS/firma, horario, servicios, formatos de impresión, PIN, respaldo).
- **Demo de 30 minutos** (PIN 1234) con datos de ejemplo y recorrido guiado; se borra sola al terminar.
- **Panel de administrador**: crear, congelar y entrar a sedes, anuncios.

## Pruebas (emuladores)
```
firebase emulators:start --only auth,firestore,hosting   # 9299 / 8280 / 5077
cd scripts && npm install
node provision.mjs 3 --emu
node e2e.mjs http://127.0.0.1:5077          # flujo completo (69 comprobaciones)
node mobile-check.mjs "http://127.0.0.1:5077/?emu=1"
node print-check.mjs http://127.0.0.1:5077
```

## Producción
```
firebase deploy --only auth,firestore,hosting --project sano-doctor
cd scripts && node provision.mjs 20      # crea admin + sede01..sede20 → CREDENCIALES_SANO_DOCTOR.txt
node prod-smoke.mjs <carpeta>  ·  node pwa-check.mjs
```
