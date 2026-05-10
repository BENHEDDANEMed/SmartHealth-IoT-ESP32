import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const WS_URL = 'ws://localhost:8000/ws';
const HISTORY_LIMIT = 24;

const theme = {
  page: '#06111F',
  pageSoft: '#0B1B2C',
  card: '#102235',
  cardSoft: '#142A40',
  cardElevated: '#17334C',
  ink: '#F8FAFC',
  muted: '#B6C5D6',
  faint: '#7F95AB',
  line: 'rgba(186, 230, 253, 0.14)',
  primary: '#38BDF8',
  primaryDark: '#0EA5E9',
  cyan: '#22D3EE',
  green: '#34D399',
  red: '#FB7185',
  orange: '#FBBF24',
  purple: '#A78BFA',
  teal: '#2DD4BF',
  shadow: '0 28px 80px rgba(0, 0, 0, 0.34)',
  shadowSoft: '0 16px 40px rgba(0, 0, 0, 0.25)'
};

const views = [
  { id: 'overview', label: 'Vue globale' },
  { id: 'cardio', label: 'Cardiaque' },
  { id: 'metabolic', label: 'Métabolique' },
  { id: 'environment', label: 'Environnement' }
];

const initialDataPoints = {
  labels: [],
  heartRate: [],
  tensionSys: [],
  glucose: [],
  temperature: [],
  humidity: []
};

function App() {
  const [dataPoints, setDataPoints] = useState(initialDataPoints);
  const [currentStatus, setCurrentStatus] = useState({ status: 0, message: 'En attente des données' });
  const [alertLogs, setAlertLogs] = useState([]);
  const [connectionState, setConnectionState] = useState('Connexion en cours');
  const [lastUpdate, setLastUpdate] = useState('--');
  const [activeView, setActiveView] = useState('overview');
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => setConnectionState('Connecté');
    ws.current.onerror = () => setConnectionState('Erreur de connexion');
    ws.current.onclose = () => setConnectionState('Déconnecté');

    ws.current.onmessage = (event) => {
      try {
        const incomingData = JSON.parse(event.data);
        const timeNow = new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const status = Number(incomingData.status ?? 0);
        const message = incomingData.message || 'Données reçues';

        setLastUpdate(timeNow);
        setCurrentStatus({ status, message });

        if (status > 0) {
          setAlertLogs((previousLogs) => {
            const newLog = {
              time: timeNow,
              level: status === 2 ? 'Critique' : 'Surveillance',
              message,
              bpm: incomingData.heart_rate ?? '--',
              sys: incomingData.tension_sys ?? '--',
              glucose: incomingData.glucose ?? '--',
              temp: incomingData.temperature ?? '--'
            };

            const duplicate =
              previousLogs.length > 0 &&
              previousLogs[0].message === newLog.message &&
              previousLogs[0].bpm === newLog.bpm &&
              previousLogs[0].sys === newLog.sys;

            return duplicate ? previousLogs : [newLog, ...previousLogs].slice(0, 6);
          });
        }

        setDataPoints((previousData) => ({
          labels: [...previousData.labels, timeNow].slice(-HISTORY_LIMIT),
          heartRate: [...previousData.heartRate, toNullableNumber(incomingData.heart_rate)].slice(-HISTORY_LIMIT),
          tensionSys: [...previousData.tensionSys, toNullableNumber(incomingData.tension_sys)].slice(-HISTORY_LIMIT),
          glucose: [...previousData.glucose, toNullableNumber(incomingData.glucose)].slice(-HISTORY_LIMIT),
          temperature: [...previousData.temperature, toNullableNumber(incomingData.temperature)].slice(-HISTORY_LIMIT),
          humidity: [...previousData.humidity, toNullableNumber(incomingData.humidity)].slice(-HISTORY_LIMIT)
        }));
      } catch {
        setConnectionState('Données invalides');
      }
    };

    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  const lastValues = useMemo(() => ({
    heartRate: lastNumber(dataPoints.heartRate),
    tensionSys: lastNumber(dataPoints.tensionSys),
    glucose: lastNumber(dataPoints.glucose),
    temperature: lastNumber(dataPoints.temperature),
    humidity: lastNumber(dataPoints.humidity)
  }), [dataPoints]);

  const riskScore = useMemo(() => calculateRiskScore(
    lastValues.heartRate,
    lastValues.tensionSys,
    lastValues.glucose,
    lastValues.temperature,
    lastValues.humidity
  ), [lastValues]);

  const healthScore = Math.max(0, 100 - riskScore);
  const statusColor = getStatusColor(currentStatus.status);

  const metrics = useMemo(() => ([
    {
      key: 'heartRate',
      code: 'HR',
      title: 'Fréquence cardiaque',
      value: lastValues.heartRate,
      unit: 'bpm',
      color: theme.red,
      icon: 'heart',
      description: getSignalDescription('HR', lastValues.heartRate),
      trend: getTrend(dataPoints.heartRate, 'bpm'),
      assessment: assessMetric('HR', lastValues.heartRate)
    },
    {
      key: 'tensionSys',
      code: 'SYS',
      title: 'Tension systolique',
      value: lastValues.tensionSys,
      unit: 'mmHg',
      color: theme.primary,
      icon: 'gauge',
      description: getSignalDescription('SYS', lastValues.tensionSys),
      trend: getTrend(dataPoints.tensionSys, 'mmHg'),
      assessment: assessMetric('SYS', lastValues.tensionSys)
    },
    {
      key: 'glucose',
      code: 'GLU',
      title: 'Glucose',
      value: lastValues.glucose,
      unit: 'g/L',
      color: theme.green,
      icon: 'drop',
      description: getSignalDescription('GLU', lastValues.glucose),
      trend: getTrend(dataPoints.glucose, 'g/L', 2),
      assessment: assessMetric('GLU', lastValues.glucose)
    },
    {
      key: 'temperature',
      code: 'TEMP',
      title: 'Température',
      value: lastValues.temperature,
      unit: '°C',
      color: theme.orange,
      icon: 'thermo',
      description: getSignalDescription('TEMP', lastValues.temperature),
      trend: getTrend(dataPoints.temperature, '°C', 1),
      assessment: assessMetric('TEMP', lastValues.temperature)
    },
    {
      key: 'humidity',
      code: 'HUM',
      title: 'Humidité',
      value: lastValues.humidity,
      unit: '%',
      color: theme.purple,
      icon: 'humidity',
      description: 'Confort ambiant',
      trend: getTrend(dataPoints.humidity, '%'),
      assessment: assessMetric('HUM', lastValues.humidity)
    }
  ]), [dataPoints, lastValues]);

  const problemSources = useMemo(() => buildProblemSources(metrics), [metrics]);
  const criticalSources = problemSources.filter((source) => source.level === 2);
  const warningSources = problemSources.filter((source) => source.level === 1);
  const healthState = getHealthState(healthScore, problemSources);
  const globalStatusLabel = getGlobalStatusLabel(problemSources);
  const insights = useMemo(
    () => buildInsights(lastValues, healthScore, currentStatus, problemSources),
    [lastValues, healthScore, currentStatus, problemSources]
  );

  const chartData = useMemo(() => {
    const datasets = [
      {
        id: 'cardio',
        label: 'Fréquence cardiaque',
        data: dataPoints.heartRate,
        borderColor: theme.red,
        backgroundColor: 'rgba(240, 68, 56, 0.10)',
        borderWidth: 3,
        tension: 0.42,
        pointRadius: 0,
        pointHitRadius: 18,
        fill: true,
        yAxisID: 'y'
      },
      {
        id: 'cardio',
        label: 'Tension systolique',
        data: dataPoints.tensionSys,
        borderColor: theme.primary,
        backgroundColor: 'rgba(20, 119, 248, 0.08)',
        borderWidth: 2.6,
        tension: 0.42,
        pointRadius: 0,
        pointHitRadius: 18,
        fill: true,
        yAxisID: 'y'
      },
      {
        id: 'metabolic',
        label: 'Glucose',
        data: dataPoints.glucose,
        borderColor: theme.green,
        backgroundColor: 'rgba(18, 183, 106, 0.08)',
        borderWidth: 2.4,
        tension: 0.42,
        pointRadius: 0,
        pointHitRadius: 18,
        fill: false,
        yAxisID: 'y2'
      },
      {
        id: 'environment',
        label: 'Température',
        data: dataPoints.temperature,
        borderColor: theme.orange,
        backgroundColor: 'rgba(247, 144, 9, 0.08)',
        borderWidth: 2.4,
        tension: 0.42,
        pointRadius: 0,
        pointHitRadius: 18,
        fill: false,
        yAxisID: 'y1'
      },
      {
        id: 'environment',
        label: 'Humidité',
        data: dataPoints.humidity,
        borderColor: theme.purple,
        backgroundColor: 'rgba(142, 92, 247, 0.08)',
        borderWidth: 2.4,
        tension: 0.42,
        pointRadius: 0,
        pointHitRadius: 18,
        fill: false,
        yAxisID: 'y1'
      }
    ];

    return {
      labels: dataPoints.labels,
      datasets: activeView === 'overview'
        ? datasets
        : datasets.filter((dataset) => dataset.id === activeView)
    };
  }, [activeView, dataPoints]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: theme.muted,
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: 18,
          font: { size: 12, weight: '700' }
        }
      },
      tooltip: {
        backgroundColor: '#101828',
        titleColor: '#FFFFFF',
        bodyColor: '#F2F4F7',
        borderColor: 'rgba(186, 230, 253, 0.16)',
        borderWidth: 1,
        padding: 13,
        displayColors: true,
        cornerRadius: 14
      }
    },
    scales: {
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        min: 20,
        max: 200,
        grid: { color: 'rgba(226, 232, 240, 0.075)', drawBorder: false },
        ticks: { color: theme.faint, font: { size: 11 } },
        title: { display: true, text: 'BPM / mmHg', color: theme.faint, font: { size: 11, weight: '800' } }
      },
      y1: {
        type: 'linear',
        display: activeView === 'overview' || activeView === 'environment',
        position: 'right',
        min: 0,
        max: 110,
        grid: { drawOnChartArea: false, drawBorder: false },
        ticks: { color: theme.faint, font: { size: 11 } },
        title: { display: true, text: '°C / %', color: theme.faint, font: { size: 11, weight: '800' } }
      },
      y2: {
        type: 'linear',
        display: activeView === 'metabolic',
        position: 'right',
        min: 0,
        max: 2,
        grid: { drawOnChartArea: false, drawBorder: false },
        ticks: { color: theme.faint, font: { size: 11 } },
        title: { display: true, text: 'g/L', color: theme.faint, font: { size: 11, weight: '800' } }
      },
      x: {
        ticks: { color: theme.faint, maxTicksLimit: 6, font: { size: 11 } },
        grid: { display: false, drawBorder: false }
      }
    }
  }), [activeView]);

  return (
    <main className="app-shell">
      <div className="app-container">
        <header className="topbar">
          <div className="brand-block">
            <div className="brand-logo">
              <PulseIcon />
            </div>
            <div>
              <p>SmartHealth</p>
              <h1>Health Monitor</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="last-update">
              <span>Dernière mise à jour</span>
              <strong>{lastUpdate}</strong>
            </div>
            <div className="live-chip">
              <span style={{ backgroundColor: statusColor }} />
              {connectionState}
            </div>
          </div>
        </header>

        <section className="hero-grid">
          <article className="hero-card">
            <div className="hero-copy">
              <p className="overline">Vue d’ensemble</p>
              <h2>Suivi intelligent des constantes vitales</h2>
              <p>
                Interface de supervision IoT avec diagnostic des sources d’alerte, analyse des tendances et score global de stabilité.
              </p>
            </div>

            <div className="hero-health">
              <ScoreRing score={healthScore} color={healthState.color} />
              <div className="health-details">
                <span>Indice global</span>
                <strong style={{ color: healthState.color }}>{healthState.label}</strong>
                <p>{globalStatusLabel}</p>

                <div className="source-summary">
                  {problemSources.length === 0 ? (
                    <span className="source-ok">Aucune mesure erronée détectée</span>
                  ) : (
                    <>
                      <div className="source-summary-header">
                        <span className="source-title">Sources détectées comme erronées</span>
                        <strong>{problemSources.length}</strong>
                      </div>

                      <div className="source-tags">
                        {problemSources.map((source) => (
                          <span
                            key={source.key}
                            className={source.level === 2 ? 'source-critical' : 'source-warning'}
                            style={{
                              color: source.color,
                              borderColor: `${source.color}70`,
                              backgroundColor: `${source.color}18`
                            }}
                          >
                            <b>{source.title}</b>
                            <small>{formatValue(source.value)} {source.unit}</small>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </article>

          <article className="focus-card heart-preview-shell">
            <HeartRatePreviewCard
              value={lastValues.heartRate}
              values={dataPoints.heartRate}
              description={getSignalDescription('HR', lastValues.heartRate)}
              lastUpdate={lastUpdate}
            />
          </article>
        </section>

        <section className="diagnostic-strip">
          <div className="diagnostic-strip-head">
            <p className="overline dark">Diagnostic des alertes</p>
            <h2>Origine probable du problème</h2>
          </div>

          <div className="diagnostic-counters">
            <StatusCounter label="Critique" value={criticalSources.length} color={theme.red} />
            <StatusCounter label="Surveillance" value={warningSources.length} color={theme.orange} />
            <StatusCounter label="Normal" value={metrics.length - problemSources.length} color={theme.green} />
          </div>
        </section>

        <section className="metric-grid">
          {metrics.map((metric) => (
            <MetricCard key={metric.key} metric={metric} />
          ))}
        </section>

        <section className="workspace-grid">
          <article className="panel chart-panel">
            <div className="panel-head chart-head">
              <div>
                <p className="overline dark">Analyse temporelle</p>
                <h2>Évolution des signaux</h2>
              </div>

              <div className="segmented-control">
                {views.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    className={activeView === view.id ? 'active' : ''}
                    onClick={() => setActiveView(view.id)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="chart-wrap">
              <Line data={chartData} options={chartOptions} />
            </div>
          </article>

          <aside className="side-stack">
            <article className={`panel diagnosis-panel ${problemSources.length > 0 ? 'has-problems' : ''}`}>
              <div className="panel-head compact">
                <div>
                  <p className="overline dark">Sources</p>
                  <h2>Causes détectées</h2>
                </div>
                <span className={`diagnosis-badge ${problemSources.length > 0 ? 'alert' : 'ok'}`}>
                  {problemSources.length}
                </span>
              </div>

              {problemSources.length === 0 ? (
                <div className="healthy-card">
                  <strong>Aucune cause active</strong>
                  <span>Toutes les mesures reçues sont actuellement dans les plages configurées.</span>
                </div>
              ) : (
                <div className="problem-list">
                  {problemSources.map((source) => (
                    <ProblemSourceCard key={source.key} source={source} />
                  ))}
                </div>
              )}
            </article>

            <article className="panel insight-panel">
              <div className="panel-head compact">
                <div>
                  <p className="overline dark">Assistant</p>
                  <h2>Insights</h2>
                </div>
              </div>

              <div className="insight-list">
                {insights.map((item) => (
                  <div className="insight-item" key={item.title}>
                    <span style={{ backgroundColor: item.color }} />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel alerts-panel">
              <div className="panel-head compact">
                <div>
                  <p className="overline dark">Historique</p>
                  <h2>Alertes récentes</h2>
                </div>
                <span className="count-badge">{alertLogs.length}</span>
              </div>

              {problemSources.length > 0 && (
                <div className="active-source-banner">
                  <strong>Source actuelle :</strong>
                  <span>{problemSources.map((source) => source.title).join(', ')}</span>
                </div>
              )}

              <div className="alert-list">
                {alertLogs.length === 0 ? (
                  <div className="empty-state">
                    <strong>Aucune alerte</strong>
                    <span>Les constantes sont actuellement suivies sans anomalie critique.</span>
                  </div>
                ) : (
                  alertLogs.map((log, index) => (
                    <div className="alert-item" key={`${log.time}-${index}`}>
                      <div>
                        <strong>{log.level}</strong>
                        <span>{log.time}</span>
                      </div>
                      <p>{log.message}</p>
                      <small>BPM : {log.bpm} · SYS : {log.sys} · Glucose : {log.glucose} · Temp : {log.temp}</small>
                    </div>
                  ))
                )}
              </div>
            </article>
          </aside>
        </section>
      </div>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        <button className="active"><PulseIcon /> Accueil</button>
        <button><HealthIcon type="gauge" /> Signaux</button>
        <button><HealthIcon type="drop" /> Rapport</button>
      </nav>

      <style>{styles}</style>
    </main>
  );
}

function MetricCard({ metric }) {
  const trendClass = metric.trend.direction === 'up' ? 'up' : metric.trend.direction === 'down' ? 'down' : 'flat';
  const severityClass = metric.assessment.level === 2 ? 'critical' : metric.assessment.level === 1 ? 'warning' : 'normal';

  return (
    <article className={`metric-card ${severityClass}`}>
      <div className="metric-top">
        <span className="metric-icon" style={{ color: metric.color, backgroundColor: `${metric.color}14` }}>
          <HealthIcon type={metric.icon} />
        </span>
        <span className={`status-pill ${severityClass}`}>{metric.assessment.label}</span>
      </div>

      <div className="metric-body">
        <p>{metric.title}</p>
        <strong style={{ color: metric.color }}>
          {formatValue(metric.value)} <small>{metric.unit}</small>
        </strong>
        <span>{metric.description}</span>
      </div>

      <div className="metric-diagnostic">
        <span className={`trend-pill ${trendClass}`}>{metric.trend.label}</span>
        <small>Plage : {metric.assessment.normalRange}</small>
      </div>

      {metric.assessment.level > 0 && (
        <div className="metric-cause" style={{ borderColor: `${metric.assessment.color}42`, backgroundColor: `${metric.assessment.color}10` }}>
          <strong>Cause</strong>
          <span>{metric.assessment.cause}</span>
        </div>
      )}

      <MiniBars values={metric.trend.values} color={metric.color} compact />
    </article>
  );
}

function HeartRatePreviewCard({ value, values, description, lastUpdate }) {
  const displayValue = formatValue(value);
  const cleanValues = values.filter(isValidNumber).slice(-24);
  const hasData = cleanValues.length >= 2;
  const chartValues = hasData ? cleanValues : [72, 74, 71, 76, 75, 73, 72, 74, 73, 72, 74, 75];
  const path = buildSparklinePath(chartValues, 300, 96);
  const fillPath = `${path} L 300 96 L 0 96 Z`;

  return (
    <div className="heart-preview-card">
      <div className="heart-preview-header">
        <div>
          <h3>Heart</h3>
          <div className="heart-preview-value">
            <strong>{displayValue}</strong>
            <span>bpm</span>
          </div>
        </div>
      </div>

      <div className="heart-preview-chart" aria-label="Courbe de fréquence cardiaque">
        <svg viewBox="0 0 300 96" preserveAspectRatio="none">
          <defs>
            <linearGradient id="heartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(240, 68, 56, 0.28)" />
              <stop offset="100%" stopColor="rgba(240, 68, 56, 0.02)" />
            </linearGradient>
          </defs>
          <path d={fillPath} fill="url(#heartFill)" />
          <path d={path} fill="none" stroke={theme.red} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="heart-preview-footer">
        <div>
          <span>{lastUpdate === '--' ? 'En attente' : lastUpdate}</span>
          <strong>Heart rate</strong>
          <small>{description}</small>
        </div>

        
      </div>
    </div>
  );
}

function ProblemSourceCard({ source }) {
  return (
    <div className={`problem-card ${source.level === 2 ? 'critical' : 'warning'}`}>
      <div className="problem-head">
        <div>
          <strong>{source.title}</strong>
          <span>{source.label}</span>
        </div>
        <b style={{ color: source.color }}>
          {formatValue(source.value)} <small>{source.unit}</small>
        </b>
      </div>

      <div className="problem-detail">
        <p><strong>Seuil :</strong> {source.normalRange}</p>
        <p><strong>Cause :</strong> {source.cause}</p>
        <p><strong>Action :</strong> {source.recommendation}</p>
      </div>
    </div>
  );
}

function StatusCounter({ label, value, color }) {
  return (
    <div className="status-counter">
      <span style={{ backgroundColor: `${color}18`, color }}>{value}</span>
      <strong>{label}</strong>
    </div>
  );
}

function ScoreRing({ score, color }) {
  const radius = 47;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - (score / 100) * circumference;

  return (
    <div className="score-ring-box">
      <svg viewBox="0 0 120 120" className="score-svg">
        <circle cx="60" cy="60" r={radius} className="score-track" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="score-progress"
          style={{ stroke: color, strokeDasharray: circumference, strokeDashoffset: progress }}
        />
      </svg>
      <div className="score-content">
        <strong>{score}</strong>
        <span>/100</span>
      </div>
    </div>
  );
}

function buildSparklinePath(values, width, height) {
  const clean = values.filter(isValidNumber);

  if (clean.length < 2) {
    return `M 0 ${height / 2} L ${width} ${height / 2}`;
  }

  const max = Math.max(...clean);
  const min = Math.min(...clean);
  const range = max - min || 1;
  const horizontalStep = width / (clean.length - 1);

  return clean
    .map((value, index) => {
      const x = index * horizontalStep;
      const y = height - ((value - min) / range) * (height * 0.72) - height * 0.14;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function MiniBars({ values, color, compact = false }) {
  const cleanValues = values.filter(isValidNumber).slice(-12);
  const max = cleanValues.length ? Math.max(...cleanValues) : 1;
  const min = cleanValues.length ? Math.min(...cleanValues) : 0;
  const range = max - min || 1;

  return (
    <div className={compact ? 'mini-bars compact' : 'mini-bars'}>
      {Array.from({ length: 12 }).map((_, index) => {
        const value = cleanValues[index];
        const height = isValidNumber(value) ? 22 + ((value - min) / range) * 54 : 20;
        return (
          <span
            key={index}
            style={{
              height: `${height}%`,
              background: isValidNumber(value)
                ? `linear-gradient(180deg, ${color}, ${color}88)`
                : 'rgba(152, 162, 179, 0.20)'
            }}
          />
        );
      })}
    </div>
  );
}

function PulseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2.2-5 4.2 10 2.1-5H21" />
    </svg>
  );
}

function HealthIcon({ type }) {
  const common = {
    width: 23,
    height: 23,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.1,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  if (type === 'heart') {
    return (
      <svg {...common}>
        <path d="M20.8 4.6c-1.6-1.7-4.2-1.7-5.8 0L12 7.7 9 4.6c-1.6-1.7-4.2-1.7-5.8 0-1.6 1.7-1.6 4.5 0 6.2L12 20l8.8-9.2c1.6-1.7 1.6-4.5 0-6.2Z" />
      </svg>
    );
  }

  if (type === 'gauge') {
    return (
      <svg {...common}>
        <path d="M4 14a8 8 0 1 1 16 0" />
        <path d="M12 14l4-4" />
        <path d="M8 20h8" />
      </svg>
    );
  }

  if (type === 'drop') {
    return (
      <svg {...common}>
        <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z" />
      </svg>
    );
  }

  if (type === 'thermo') {
    return (
      <svg {...common}>
        <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 3s5 5.6 5 10a5 5 0 0 1-10 0c0-4.4 5-10 5-10Z" />
      <path d="M8.5 19.5c2.3 1.3 4.7 1.3 7 0" />
    </svg>
  );
}

function calculateRiskScore(bpm, sys, glucose, temperature, humidity) {
  let score = 0;

  const hr = assessMetric('HR', bpm);
  const tension = assessMetric('SYS', sys);
  const glu = assessMetric('GLU', glucose);
  const temp = assessMetric('TEMP', temperature);
  const hum = assessMetric('HUM', humidity);

  const assessments = [
    { item: hr, critical: 35, warning: 16 },
    { item: tension, critical: 35, warning: 16 },
    { item: glu, critical: 15, warning: 9 },
    { item: temp, critical: 15, warning: 9 },
    { item: hum, critical: 0, warning: 6 }
  ];

  assessments.forEach(({ item, critical, warning }) => {
    if (item.level === 2) score += critical;
    if (item.level === 1) score += warning;
  });

  const activeProblems = assessments.filter(({ item }) => item.level > 0).length;

  if (activeProblems >= 3) score += 8;
  if (assessments.some(({ item }) => item.level === 2) && activeProblems >= 2) score += 7;

  return Math.min(score, 100);
}

function assessMetric(type, value) {
  if (!isValidNumber(value)) {
    return {
      level: 0,
      label: 'En attente',
      color: theme.faint,
      normalRange: getNormalRange(type),
      cause: 'Aucune donnée reçue pour cette mesure.',
      recommendation: 'Vérifier la transmission du capteur.'
    };
  }

  const normal = {
    level: 0,
    label: 'Normal',
    color: theme.green,
    normalRange: getNormalRange(type),
    cause: 'La valeur est dans la plage configurée.',
    recommendation: 'Continuer la surveillance.'
  };

  switch (type) {
    case 'HR':
      if (value > 115) return makeAssessment(2, 'Critique', theme.red, 'Fréquence cardiaque trop élevée', 'La fréquence cardiaque dépasse le seuil critique de 115 bpm.', 'Vérifier le capteur, confirmer la mesure et déclencher une vérification immédiate.', type);
      if (value < 50) return makeAssessment(2, 'Critique', theme.red, 'Fréquence cardiaque trop basse', 'La fréquence cardiaque est inférieure au seuil critique de 50 bpm.', 'Confirmer la mesure et vérifier l’état du patient ou du simulateur.', type);
      if (value > 100) return makeAssessment(1, 'Surveillance', theme.orange, 'Fréquence cardiaque élevée', 'La fréquence cardiaque dépasse la plage normale de 100 bpm.', 'Surveiller l’évolution sur les prochaines mesures.', type);
      if (value < 60) return makeAssessment(1, 'Surveillance', theme.orange, 'Fréquence cardiaque basse', 'La fréquence cardiaque est sous la zone de confort configurée.', 'Contrôler la stabilité du signal et suivre la tendance.', type);
      return normal;

    case 'SYS':
      if (value > 155) return makeAssessment(2, 'Critique', theme.red, 'Tension systolique trop élevée', 'La tension systolique dépasse le seuil critique de 155 mmHg.', 'Vérifier la source de mesure et contrôler rapidement la situation.', type);
      if (value < 90) return makeAssessment(2, 'Critique', theme.red, 'Tension systolique trop basse', 'La tension systolique est inférieure au seuil critique de 90 mmHg.', 'Confirmer la mesure et surveiller la stabilité générale.', type);
      if (value > 140) return makeAssessment(1, 'Surveillance', theme.orange, 'Tension élevée', 'La tension systolique dépasse le seuil de surveillance de 140 mmHg.', 'Suivre les prochaines lectures et contrôler la cohérence du capteur.', type);
      if (value < 100) return makeAssessment(1, 'Surveillance', theme.orange, 'Tension légèrement basse', 'La tension systolique est proche de la limite basse.', 'Surveiller la tendance et vérifier la qualité du signal.', type);
      return normal;

    case 'GLU':
      if (value > 1.35) return makeAssessment(2, 'Critique', theme.red, 'Glucose trop élevé', 'La glycémie dépasse le seuil critique de 1.35 g/L.', 'Confirmer la mesure et vérifier l’évolution du glucose.', type);
      if (value < 0.7) return makeAssessment(2, 'Critique', theme.red, 'Glucose trop bas', 'La glycémie est inférieure au seuil critique de 0.70 g/L.', 'Confirmer la mesure et prioriser la surveillance.', type);
      if (value > 1.15) return makeAssessment(1, 'Surveillance', theme.orange, 'Glucose élevé', 'La glycémie dépasse la plage normale configurée.', 'Suivre l’évolution des prochaines mesures.', type);
      if (value < 0.8) return makeAssessment(1, 'Surveillance', theme.orange, 'Glucose bas', 'La glycémie approche la limite basse.', 'Contrôler la tendance et la cohérence de la mesure.', type);
      return normal;

    case 'TEMP':
      if (value >= 38.0) return makeAssessment(2, 'Critique', theme.red, 'Température élevée', 'La température atteint ou dépasse 38.0 °C.', 'Confirmer la lecture et vérifier si l’alerte est persistante.', type);
      if (value < 35.0) return makeAssessment(2, 'Critique', theme.red, 'Température trop basse', 'La température est inférieure au seuil critique de 35.0 °C.', 'Confirmer la mesure et vérifier le capteur.', type);
      if (value >= 37.5) return makeAssessment(1, 'Surveillance', theme.orange, 'Température à surveiller', 'La température se rapproche du seuil d’alerte.', 'Surveiller la progression sur les prochaines lectures.', type);
      if (value < 36.0) return makeAssessment(1, 'Surveillance', theme.orange, 'Température basse', 'La température est légèrement sous la plage attendue.', 'Vérifier la stabilité du capteur et l’environnement.', type);
      return normal;

    case 'HUM':
      if (value > 80) return makeAssessment(1, 'Surveillance', theme.orange, 'Humidité élevée', 'Le niveau d’humidité dépasse la zone de confort configurée.', 'Vérifier les conditions ambiantes autour du capteur.', type);
      if (value < 20) return makeAssessment(1, 'Surveillance', theme.orange, 'Humidité basse', 'Le niveau d’humidité est inférieur à la zone de confort configurée.', 'Vérifier l’environnement et la stabilité du capteur.', type);
      return normal;

    default:
      return normal;
  }
}

function makeAssessment(level, label, color, cause, detail, recommendation, type) {
  return {
    level,
    label,
    color,
    normalRange: getNormalRange(type),
    cause,
    detail,
    recommendation
  };
}

function getNormalRange(type) {
  switch (type) {
    case 'HR': return '60 - 100 bpm';
    case 'SYS': return '100 - 140 mmHg';
    case 'GLU': return '0.80 - 1.15 g/L';
    case 'TEMP': return '36.0 - 37.5 °C';
    case 'HUM': return '20 - 80 %';
    default: return 'Non défini';
  }
}

function buildProblemSources(metrics) {
  return metrics
    .filter((metric) => metric.assessment.level > 0)
    .sort((a, b) => b.assessment.level - a.assessment.level)
    .map((metric) => ({
      key: metric.key,
      title: metric.title,
      value: metric.value,
      unit: metric.unit,
      color: metric.assessment.color,
      level: metric.assessment.level,
      label: metric.assessment.label,
      cause: metric.assessment.cause,
      detail: metric.assessment.detail,
      recommendation: metric.assessment.recommendation,
      normalRange: metric.assessment.normalRange
    }));
}

function getHealthState(score, problemSources = []) {
  const hasCritical = problemSources.some((source) => source.level === 2);
  const hasWarning = problemSources.some((source) => source.level === 1);

  if (hasCritical || score < 60) {
    return { label: 'Risque élevé', color: theme.red };
  }

  if (hasWarning || score < 90) {
    return { label: 'À surveiller', color: theme.orange };
  }

  return { label: 'Stable', color: theme.green };
}

function getGlobalStatusLabel(problemSources = []) {
  if (problemSources.length === 0) {
    return 'Toutes les mesures sont dans les plages configurées.';
  }

  const critical = problemSources.filter((source) => source.level === 2);
  const warning = problemSources.filter((source) => source.level === 1);

  if (critical.length > 0) {
    return `${critical.length} mesure(s) critique(s) et ${warning.length} mesure(s) en surveillance.`;
  }

  return `${warning.length} mesure(s) en surveillance. Aucune mesure critique détectée.`;
}

function getStatusColor(status) {
  if (status === 2) return theme.red;
  if (status === 1) return theme.orange;
  return theme.green;
}

function getSignalDescription(type, value) {
  if (!isValidNumber(value)) return 'En attente de mesure';
  return assessMetric(type, value).cause;
}

function buildInsights(values, score, status, problemSources) {
  const items = [];

  if (problemSources.length > 0) {
    const sourceNames = problemSources.map((source) => source.title).join(', ');
    items.push({
      title: 'Origine de l’alerte',
      text: `Les mesures responsables sont : ${sourceNames}.`,
      color: problemSources.some((source) => source.level === 2) ? theme.red : theme.orange
    });
  } else {
    items.push({
      title: 'Profil stable',
      text: 'Aucune mesure ne dépasse les seuils de surveillance configurés.',
      color: theme.green
    });
  }

  if (isValidNumber(values.heartRate)) {
    items.push({
      title: 'Signal cardiaque',
      text: assessMetric('HR', values.heartRate).cause,
      color: assessMetric('HR', values.heartRate).color
    });
  }

  if (isValidNumber(values.temperature)) {
    items.push({
      title: 'Température',
      text: assessMetric('TEMP', values.temperature).cause,
      color: assessMetric('TEMP', values.temperature).color
    });
  }

  if (status.status > 0) {
    items.push({
      title: 'Message système',
      text: status.message,
      color: status.status === 2 ? theme.red : theme.orange
    });
  }

  return items.slice(0, 4);
}

function getTrend(values, unit, precision = 0) {
  const clean = values.filter(isValidNumber);
  const last = clean.at(-1);
  const previous = clean.at(-2);

  if (!isValidNumber(last) || !isValidNumber(previous)) {
    return { label: 'Nouveau', direction: 'flat', values: clean };
  }

  const delta = last - previous;
  if (Math.abs(delta) < 0.01) return { label: 'Stable', direction: 'flat', values: clean };

  const formatted = Math.abs(delta).toFixed(precision);
  return {
    label: `${delta > 0 ? '+' : '-'}${formatted} ${unit}`,
    direction: delta > 0 ? 'up' : 'down',
    values: clean
  };
}

function toNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lastNumber(values) {
  const clean = values.filter(isValidNumber);
  return clean.length ? clean.at(-1) : null;
}

function isValidNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatValue(value) {
  if (!isValidNumber(value)) return '--';
  return Number.isInteger(value) ? value : value.toFixed(1);
}

const styles = `
  * {
    box-sizing: border-box;
  }

  :root {
    color-scheme: dark;
  }

  body {
    margin: 0;
    background: ${theme.page};
  }

  button {
    font-family: inherit;
  }

  .app-shell {
    min-height: 100vh;
    padding: 28px;
    color: ${theme.ink};
    background:
      radial-gradient(circle at 8% 4%, rgba(56, 189, 248, 0.18), transparent 30%),
      radial-gradient(circle at 92% 8%, rgba(45, 212, 191, 0.15), transparent 34%),
      radial-gradient(circle at 50% 100%, rgba(167, 139, 250, 0.10), transparent 36%),
      linear-gradient(135deg, #06111F 0%, #0B1B2C 48%, #071827 100%);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .app-container {
    width: min(1460px, 100%);
    margin: 0 auto;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 22px;
    margin-bottom: 24px;
    padding: 8px 2px;
  }

  .brand-block {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .brand-logo {
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    color: #ECFEFF;
    background: linear-gradient(135deg, #0EA5E9 0%, #14B8A6 100%);
    border: 1px solid rgba(186, 230, 253, 0.18);
    border-radius: 20px;
    box-shadow: 0 18px 38px rgba(14, 165, 233, 0.22);
  }

  .brand-block p,
  .brand-block h1 {
    margin: 0;
  }

  .brand-block p {
    color: ${theme.muted};
    font-size: 13px;
    font-weight: 850;
    letter-spacing: -0.02em;
  }

  .brand-block h1 {
    color: ${theme.ink};
    font-size: 29px;
    line-height: 1.05;
    letter-spacing: -0.055em;
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .last-update,
  .live-chip {
    border: 1px solid ${theme.line};
    background: rgba(16, 34, 53, 0.70);
    backdrop-filter: blur(22px);
    box-shadow: ${theme.shadowSoft};
  }

  .last-update {
    min-width: 164px;
    padding: 12px 17px;
    border-radius: 22px;
    text-align: right;
  }

  .last-update span,
  .last-update strong {
    display: block;
  }

  .last-update span {
    color: ${theme.faint};
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.09em;
  }

  .last-update strong {
    margin-top: 3px;
    color: ${theme.ink};
    font-size: 15px;
  }

  .live-chip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-radius: 999px;
    color: ${theme.muted};
    font-size: 13px;
    font-weight: 900;
  }

  .live-chip span {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    box-shadow: 0 0 0 8px rgba(52, 211, 153, 0.12);
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.75fr) minmax(330px, 0.72fr);
    gap: 22px;
    margin-bottom: 22px;
  }

  .hero-card,
  .focus-card,
  .panel,
  .metric-card,
  .diagnostic-strip {
    border: 1px solid ${theme.line};
    box-shadow: ${theme.shadow};
  }

  .hero-card {
    position: relative;
    overflow: hidden;
    min-height: 360px;
    display: grid;
    grid-template-columns: minmax(0, 1.13fr) minmax(330px, 0.87fr);
    align-items: center;
    gap: 30px;
    padding: 34px;
    color: ${theme.ink};
    border-radius: 42px;
    background:
      radial-gradient(circle at 84% 14%, rgba(56, 189, 248, 0.18), transparent 26%),
      radial-gradient(circle at 8% 92%, rgba(45, 212, 191, 0.22), transparent 38%),
      linear-gradient(135deg, #081625 0%, #102B43 50%, #0F5163 100%);
  }

  .hero-card::before {
    content: '';
    position: absolute;
    inset: 20px;
    border: 1px solid rgba(186, 230, 253, 0.12);
    border-radius: 34px;
    pointer-events: none;
  }

  .hero-card::after {
    content: '';
    position: absolute;
    width: 320px;
    height: 320px;
    right: -125px;
    top: -120px;
    border-radius: 50%;
    background: rgba(34, 211, 238, 0.10);
    filter: blur(2px);
  }

  .hero-copy,
  .hero-health {
    position: relative;
    z-index: 1;
  }

  .overline {
    margin: 0;
    color: rgba(226, 232, 240, 0.72);
    font-size: 11px;
    font-weight: 950;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .overline.dark {
    color: ${theme.faint};
  }

  .hero-copy h2 {
    max-width: 640px;
    margin: 11px 0 17px;
    font-size: clamp(38px, 5.8vw, 68px);
    line-height: 0.93;
    letter-spacing: -0.08em;
  }

  .hero-copy p:not(.overline) {
    max-width: 580px;
    margin: 0;
    color: rgba(226, 232, 240, 0.76);
    font-size: 16px;
    line-height: 1.72;
  }

  .hero-health {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 22px;
    padding: 24px;
    border-radius: 34px;
    background: rgba(16, 34, 53, 0.58);
    border: 1px solid rgba(186, 230, 253, 0.14);
    backdrop-filter: blur(20px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .score-ring-box {
    position: relative;
    width: 152px;
    height: 152px;
    flex: 0 0 152px;
  }

  .score-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .score-track,
  .score-progress {
    fill: none;
    stroke-width: 11;
  }

  .score-track {
    stroke: rgba(226, 232, 240, 0.16);
  }

  .score-progress {
    stroke-linecap: round;
    transition: stroke-dashoffset 0.4s ease;
  }

  .score-content {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: baseline;
    justify-content: center;
    padding-top: 49px;
  }

  .score-content strong {
    font-size: 49px;
    line-height: 1;
    letter-spacing: -0.08em;
  }

  .score-content span {
    color: rgba(226, 232, 240, 0.62);
    font-size: 14px;
    font-weight: 900;
  }

  .health-details span,
  .health-details strong,
  .health-details p {
    display: block;
    margin: 0;
  }

  .health-details span {
    color: rgba(226, 232, 240, 0.70);
    font-size: 13px;
    font-weight: 850;
  }

  .health-details strong {
    margin: 7px 0 8px;
    font-size: 34px;
    letter-spacing: -0.055em;
  }

  .health-details p {
    color: rgba(226, 232, 240, 0.74);
    font-size: 13px;
    line-height: 1.55;
  }

  .source-summary {
    margin-top: 16px;
  }

  .source-summary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .source-summary-header strong {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    color: ${theme.ink};
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(186, 230, 253, 0.16);
    border-radius: 50%;
    font-size: 12px;
    font-weight: 950;
  }

  .source-title {
    color: rgba(226, 232, 240, 0.80) !important;
    font-size: 12px !important;
    font-weight: 950 !important;
    letter-spacing: 0.02em;
  }

  .source-ok {
    display: inline-flex !important;
    padding: 10px 12px;
    color: rgba(226, 232, 240, 0.88) !important;
    background: rgba(52, 211, 153, 0.14);
    border: 1px solid rgba(52, 211, 153, 0.24);
    border-radius: 999px;
  }

  .source-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-height: 124px;
    overflow-y: auto;
    padding-right: 3px;
  }

  .source-tags span {
    display: inline-flex !important;
    align-items: center;
    gap: 7px;
    padding: 8px 12px;
    border: 1px solid;
    border-radius: 999px;
    font-size: 11px !important;
    font-weight: 900 !important;
    backdrop-filter: blur(10px);
  }

  .source-tags span b,
  .source-tags span small {
    display: inline !important;
    margin: 0 !important;
  }

  .source-tags span b {
    font-size: 11px;
    font-weight: 950;
  }

  .source-tags span small {
    color: rgba(226, 232, 240, 0.80) !important;
    font-size: 10px !important;
    font-weight: 850 !important;
  }

  .source-critical {
    box-shadow: 0 0 0 1px rgba(251, 113, 133, 0.08), 0 10px 20px rgba(251, 113, 133, 0.12);
  }

  .source-warning {
    box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.08), 0 10px 20px rgba(251, 191, 36, 0.10);
  }

  .focus-card {
    min-height: 360px;
    padding: 0;
    border-radius: 42px;
    background: transparent;
  }

  .heart-preview-shell {
    display: block;
    min-height: 360px;
    border: 0;
    box-shadow: none;
    background: transparent;
  }

  .heart-preview-card {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 360px;
    padding: 34px;
    overflow: hidden;
    border-radius: 42px;
    background:
      radial-gradient(circle at 86% 10%, rgba(251, 113, 133, 0.12), transparent 32%),
      linear-gradient(180deg, rgba(20, 42, 64, 0.96), rgba(16, 34, 53, 0.92));
    border: 1px solid ${theme.line};
    box-shadow: ${theme.shadow};
  }

  .heart-preview-card::before {
    content: '';
    position: absolute;
    inset: 18px;
    pointer-events: none;
    border: 1px solid rgba(186, 230, 253, 0.10);
    border-radius: 34px;
    background: linear-gradient(180deg, rgba(255,255,255,0.045), transparent 58%);
  }

  .heart-preview-header,
  .heart-preview-chart,
  .heart-preview-footer {
    position: relative;
    z-index: 1;
  }

  .heart-preview-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .heart-preview-header h3 {
    margin: 0 0 15px;
    color: ${theme.ink};
    font-size: 31px;
    line-height: 1;
    font-weight: 950;
    letter-spacing: -0.06em;
  }

  .heart-preview-value {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .heart-preview-value strong {
    color: ${theme.red};
    font-size: 67px;
    line-height: 0.9;
    font-weight: 950;
    letter-spacing: -0.09em;
  }

  .heart-preview-value span {
    color: ${theme.muted};
    font-size: 18px;
    font-weight: 800;
  }

  .heart-preview-chart {
    height: 124px;
    margin: 26px 0 20px;
  }

  .heart-preview-chart svg {
    width: 100%;
    height: 100%;
    overflow: visible;
    filter: drop-shadow(0 12px 16px rgba(251, 113, 133, 0.13));
  }

  .heart-preview-footer {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
  }

  .heart-preview-footer span,
  .heart-preview-footer strong,
  .heart-preview-footer small {
    display: block;
  }

  .heart-preview-footer span {
    color: ${theme.muted};
    font-size: 15px;
    font-weight: 800;
  }

  .heart-preview-footer strong {
    margin-top: 3px;
    color: ${theme.ink};
    font-size: 19px;
    font-weight: 850;
  }

  .heart-preview-footer small {
    max-width: 300px;
    margin-top: 4px;
    color: ${theme.faint};
    font-size: 12px;
    line-height: 1.35;
  }

  .diagnostic-strip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;
    margin-bottom: 22px;
    padding: 22px;
    border-radius: 32px;
    background: rgba(16, 34, 53, 0.72);
    backdrop-filter: blur(20px);
  }

  .diagnostic-strip h2 {
    margin: 5px 0 0;
    color: ${theme.ink};
    font-size: 25px;
    letter-spacing: -0.055em;
  }

  .diagnostic-counters {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }

  .status-counter {
    min-width: 122px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 13px;
    border: 1px solid ${theme.line};
    background: rgba(20, 42, 64, 0.70);
    border-radius: 19px;
  }

  .status-counter span {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 13px;
    font-size: 14px;
    font-weight: 950;
  }

  .status-counter strong {
    font-size: 12px;
    color: ${theme.muted};
  }

  .mini-bars {
    height: 84px;
    display: flex;
    align-items: end;
    gap: 7px;
    margin-top: 24px;
    padding: 0 2px;
  }

  .mini-bars.compact {
    height: 42px;
    margin-top: 14px;
    gap: 5px;
  }

  .mini-bars span {
    flex: 1;
    min-width: 4px;
    border-radius: 999px 999px 5px 5px;
    opacity: 0.82;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 22px;
  }

  .metric-card {
    min-height: 254px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 19px;
    border-radius: 32px;
    background: rgba(16, 34, 53, 0.74);
    backdrop-filter: blur(20px);
    border-left-width: 5px;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .metric-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 28px 72px rgba(0, 0, 0, 0.30);
  }

  .metric-card.normal {
    border-left-color: ${theme.green};
  }

  .metric-card.warning {
    border-left-color: ${theme.orange};
  }

  .metric-card.critical {
    border-left-color: ${theme.red};
    box-shadow: 0 24px 70px rgba(251, 113, 133, 0.14);
  }

  .metric-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .metric-icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 18px;
  }

  .status-pill,
  .trend-pill {
    padding: 7px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .status-pill.normal {
    color: ${theme.green};
    background: rgba(52, 211, 153, 0.12);
  }

  .status-pill.warning {
    color: ${theme.orange};
    background: rgba(251, 191, 36, 0.13);
  }

  .status-pill.critical {
    color: ${theme.red};
    background: rgba(251, 113, 133, 0.13);
  }

  .trend-pill.up {
    color: ${theme.red};
    background: rgba(251, 113, 133, 0.10);
  }

  .trend-pill.down {
    color: ${theme.green};
    background: rgba(52, 211, 153, 0.10);
  }

  .trend-pill.flat {
    color: ${theme.muted};
    background: rgba(20, 42, 64, 0.80);
  }

  .metric-body p,
  .metric-body strong,
  .metric-body span {
    display: block;
    margin: 0;
  }

  .metric-body p {
    color: ${theme.muted};
    font-size: 13px;
    font-weight: 850;
  }

  .metric-body strong {
    margin: 8px 0 7px;
    font-size: 35px;
    line-height: 1;
    letter-spacing: -0.065em;
  }

  .metric-body small {
    color: ${theme.faint};
    font-size: 12px;
    letter-spacing: 0;
  }

  .metric-body span {
    color: ${theme.faint};
    font-size: 12px;
    line-height: 1.45;
  }

  .metric-diagnostic {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }

  .metric-diagnostic small {
    color: ${theme.faint};
    font-size: 11px;
    font-weight: 850;
    text-align: right;
  }

  .metric-cause {
    margin-top: 11px;
    padding: 10px;
    border: 1px solid;
    border-radius: 17px;
  }

  .metric-cause strong,
  .metric-cause span {
    display: block;
  }

  .metric-cause strong {
    margin-bottom: 3px;
    color: ${theme.ink};
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }

  .metric-cause span {
    color: ${theme.muted};
    font-size: 12px;
    line-height: 1.4;
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(360px, 0.85fr);
    gap: 22px;
  }

  .panel {
    padding: 24px;
    border-radius: 36px;
    background: rgba(16, 34, 53, 0.74);
    backdrop-filter: blur(20px);
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
    margin-bottom: 18px;
  }

  .panel-head.compact {
    margin-bottom: 14px;
  }

  .panel h2 {
    margin: 6px 0 0;
    color: ${theme.ink};
    font-size: 25px;
    letter-spacing: -0.055em;
  }

  .chart-panel {
    min-height: 570px;
  }

  .chart-head {
    align-items: center;
  }

  .segmented-control {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    padding: 6px;
    border: 1px solid ${theme.line};
    background: rgba(20, 42, 64, 0.76);
    border-radius: 19px;
  }

  .segmented-control button {
    border: 0;
    cursor: pointer;
    padding: 10px 14px;
    color: ${theme.muted};
    background: transparent;
    border-radius: 14px;
    font-size: 12px;
    font-weight: 900;
    transition: 0.2s ease;
  }

  .segmented-control button:hover {
    color: ${theme.ink};
    background: rgba(56, 189, 248, 0.10);
  }

  .segmented-control button.active {
    color: #ECFEFF;
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.45), rgba(20, 184, 166, 0.38));
    box-shadow: 0 10px 20px rgba(14, 165, 233, 0.18);
  }

  .chart-wrap {
    height: 462px;
  }

  .side-stack {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .diagnosis-panel.has-problems {
    box-shadow: 0 24px 70px rgba(251, 191, 36, 0.10);
  }

  .diagnosis-badge,
  .count-badge {
    min-width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 13px;
    font-size: 13px;
    font-weight: 950;
  }

  .diagnosis-badge.ok {
    color: ${theme.green};
    background: rgba(52, 211, 153, 0.10);
  }

  .diagnosis-badge.alert,
  .count-badge {
    color: ${theme.primary};
    background: rgba(56, 189, 248, 0.11);
  }

  .healthy-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 18px;
    border-radius: 22px;
    color: ${theme.green};
    background: rgba(52, 211, 153, 0.10);
    border: 1px solid rgba(52, 211, 153, 0.18);
  }

  .healthy-card span {
    color: ${theme.muted};
    font-size: 12px;
    line-height: 1.5;
  }

  .problem-list,
  .insight-list,
  .alert-list {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .problem-card {
    padding: 15px;
    border-radius: 23px;
    border: 1px solid ${theme.line};
    background: rgba(20, 42, 64, 0.74);
  }

  .problem-card.warning {
    border-color: rgba(251, 191, 36, 0.24);
    background: rgba(251, 191, 36, 0.08);
  }

  .problem-card.critical {
    border-color: rgba(251, 113, 133, 0.22);
    background: rgba(251, 113, 133, 0.07);
  }

  .problem-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .problem-head strong,
  .problem-head span,
  .problem-head b {
    display: block;
  }

  .problem-head strong {
    color: ${theme.ink};
    font-size: 14px;
  }

  .problem-head span {
    margin-top: 3px;
    color: ${theme.muted};
    font-size: 12px;
    font-weight: 850;
  }

  .problem-head b {
    text-align: right;
    font-size: 22px;
    letter-spacing: -0.04em;
  }

  .problem-head small {
    color: ${theme.faint};
    font-size: 11px;
    letter-spacing: 0;
  }

  .problem-detail {
    display: grid;
    gap: 6px;
  }

  .problem-detail p {
    margin: 0;
    color: ${theme.muted};
    font-size: 12px;
    line-height: 1.45;
  }

  .problem-detail strong {
    color: ${theme.ink};
  }

  .insight-item {
    display: flex;
    gap: 12px;
    padding: 15px;
    border: 1px solid ${theme.line};
    background: rgba(20, 42, 64, 0.74);
    border-radius: 22px;
  }

  .insight-item > span {
    width: 10px;
    height: 10px;
    flex: 0 0 10px;
    margin-top: 5px;
    border-radius: 50%;
  }

  .insight-item strong,
  .insight-item p {
    margin: 0;
  }

  .insight-item strong {
    color: ${theme.ink};
    font-size: 13px;
  }

  .insight-item p {
    margin-top: 4px;
    color: ${theme.muted};
    font-size: 12px;
    line-height: 1.55;
  }

  .active-source-banner {
    display: grid;
    gap: 4px;
    margin-bottom: 12px;
    padding: 13px 15px;
    border-radius: 19px;
    color: ${theme.red};
    background: rgba(251, 113, 133, 0.08);
    border: 1px solid rgba(251, 113, 133, 0.16);
  }

  .active-source-banner strong {
    font-size: 12px;
  }

  .active-source-banner span {
    color: ${theme.muted};
    font-size: 12px;
    line-height: 1.45;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 20px;
    border: 1px dashed ${theme.line};
    background: rgba(20, 42, 64, 0.60);
    border-radius: 22px;
    text-align: center;
  }

  .empty-state strong {
    color: ${theme.ink};
    font-size: 14px;
  }

  .empty-state span {
    color: ${theme.faint};
    font-size: 12px;
    line-height: 1.5;
  }

  .alert-item {
    padding: 15px;
    border-radius: 21px;
    border: 1px solid rgba(251, 113, 133, 0.16);
    background: rgba(251, 113, 133, 0.06);
  }

  .alert-item div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 7px;
  }

  .alert-item strong {
    color: ${theme.red};
    font-size: 13px;
  }

  .alert-item span,
  .alert-item small {
    color: ${theme.faint};
    font-size: 11px;
    font-weight: 850;
  }

  .alert-item p {
    margin: 0 0 7px;
    color: ${theme.muted};
    font-size: 12px;
    line-height: 1.48;
  }

  .mobile-nav {
    display: none;
  }

  @media (max-width: 1220px) {
    .hero-grid,
    .workspace-grid {
      grid-template-columns: 1fr;
    }

    .metric-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .hero-card {
      grid-template-columns: 1fr;
    }

    .topbar,
    .topbar-actions,
    .chart-head,
    .diagnostic-strip {
      align-items: stretch;
      flex-direction: column;
    }

    .last-update {
      text-align: left;
    }

    .segmented-control,
    .diagnostic-counters {
      justify-content: flex-start;
    }
  }

  @media (max-width: 720px) {
    .app-shell {
      padding: 14px 14px 92px;
    }

    .brand-logo {
      width: 46px;
      height: 46px;
      border-radius: 16px;
    }

    .brand-block h1 {
      font-size: 22px;
    }

    .hero-card,
    .focus-card,
    .panel,
    .metric-card,
    .diagnostic-strip {
      border-radius: 28px;
    }

    .hero-card {
      min-height: auto;
      padding: 24px;
    }

    .hero-copy h2 {
      font-size: 39px;
    }

    .hero-health {
      grid-template-columns: 1fr;
      justify-items: start;
    }

    .metric-grid {
      grid-template-columns: 1fr;
    }

    .diagnostic-counters {
      display: grid;
      grid-template-columns: 1fr;
    }

    .status-counter {
      width: 100%;
    }

    .panel-head {
      flex-direction: column;
    }

    .segmented-control {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .segmented-control button {
      width: 100%;
    }

    .chart-panel {
      min-height: 500px;
    }

    .chart-wrap {
      height: 370px;
    }

    .heart-preview-card {
      min-height: 320px;
      padding: 26px;
    }

    .heart-preview-value strong {
      font-size: 58px;
    }

    .heart-preview-chart {
      height: 105px;
    }

    .mobile-nav {
      position: fixed;
      left: 14px;
      right: 14px;
      bottom: 14px;
      z-index: 50;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 7px;
      padding: 8px;
      border: 1px solid ${theme.line};
      border-radius: 24px;
      background: rgba(16, 34, 53, 0.90);
      backdrop-filter: blur(18px);
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.30);
    }

    .mobile-nav button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 0;
      padding: 11px 5px;
      color: ${theme.faint};
      background: transparent;
      border-radius: 17px;
      font-size: 11px;
      font-weight: 900;
    }

    .mobile-nav button svg {
      width: 17px;
      height: 17px;
    }

    .mobile-nav button.active {
      color: #ECFEFF;
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.55), rgba(20, 184, 166, 0.48));
    }
  }
`;

export default App;
