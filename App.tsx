import { useState, useEffect, useCallback } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { ConfigPanel } from './components/ConfigPanel'
import { ResultsDashboard } from './components/ResultsDashboard'
import { MarketMonitor } from './components/MarketMonitor'
import { FinancialReportModal } from './components/FinancialReportModal'
import { BUILT_IN_DATA_SOURCES } from './constants'
import { runBacktest } from './services/simulationEngine'
import { getStrategyByType } from './services/strategies'
import { DataSource, Profile, SimulationResult, AssetEntry, AssetDataRow, ProfileConfig, StrategyType } from './types'
import {
  LayoutDashboard,
  Settings2,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  LineChart,
} from 'lucide-react'
import { LanguageProvider, useTranslation, Language } from './services/i18n'
import { version } from './package.json'

const CREATE_DEFAULT_PROFILES = (): Profile[] => [
  {
    id: '1', name: 'Conservative', color: '#2563eb',
    strategyType: 'NO_REBALANCE' as StrategyType,
    enabled: true,
    assets: [
      { dataSourceId: 'builtin-qqq', targetWeight: 50, contributionWeight: 100, pledgeRatio: 0.7 },
      { dataSourceId: 'builtin-qld', targetWeight: 40, contributionWeight: 0, pledgeRatio: 0.0 },
    ],
    config: { initialCapital: 1000000, contributionAmount: 5000, contributionIntervalMonths: 1, yearlyContributionMonth: 12, cashYieldAnnual: 2.0, annualExpenseAmount: 30000, cashCoverageYears: 15, leverage: { enabled: false, interestRate: 5, cashPledgeRatio: 0.95, maxLtv: 100, withdrawType: 'PERCENT', withdrawValue: 2, inflationRate: 0, interestType: 'CAPITALIZED', ltvBasis: 'TOTAL_ASSETS' } },
  },
  {
    id: '2', name: 'Aggressive', color: '#ea580c',
    strategyType: 'SMART' as StrategyType,
    enabled: true,
    assets: [
      { dataSourceId: 'builtin-qqq', targetWeight: 10, contributionWeight: 10, pledgeRatio: 0.7 },
      { dataSourceId: 'builtin-qld', targetWeight: 80, contributionWeight: 80, pledgeRatio: 0.0 },
    ],
    config: { initialCapital: 1000000, contributionAmount: 5000, contributionIntervalMonths: 1, yearlyContributionMonth: 12, cashYieldAnnual: 2.0, annualExpenseAmount: 30000, cashCoverageYears: 15, leverage: { enabled: false, interestRate: 5, cashPledgeRatio: 0.95, maxLtv: 100, withdrawType: 'PERCENT', withdrawValue: 2, inflationRate: 0, interestType: 'CAPITALIZED', ltvBasis: 'TOTAL_ASSETS' } },
  },
]

const migrateProfile = (p: any): Profile => {
  if (p.assets) return p as Profile
  const c = p.config || {}
  return {
    id: p.id, name: p.name, color: p.color || '#000000',
    strategyType: p.strategyType || 'NO_REBALANCE',
    enabled: p.enabled !== false,
    assets: [
      { dataSourceId: p.dataSourceId || 'builtin-qqq', targetWeight: c.indexWeight ?? 50, contributionWeight: c.contributionIndexWeight ?? 50, pledgeRatio: c.leverage?.indexPledgeRatio ?? 0.7 },
      { dataSourceId: p.dataSourceId ? `custom-${p.dataSourceId}-2` : 'builtin-qld', targetWeight: c.leveragedWeight ?? 40, contributionWeight: c.contributionLeveragedWeight ?? 40, pledgeRatio: c.leverage?.leveragedPledgeRatio ?? 0 },
    ],
    config: { initialCapital: c.initialCapital ?? 1000000, contributionAmount: c.contributionAmount ?? 5000, contributionIntervalMonths: c.contributionIntervalMonths ?? 1, yearlyContributionMonth: c.yearlyContributionMonth ?? 12, cashYieldAnnual: c.cashYieldAnnual ?? 2, annualExpenseAmount: c.annualExpenseAmount, cashCoverageYears: c.cashCoverageYears, leverage: { ...c.leverage, enabled: c.leverage?.enabled ?? false, interestRate: c.leverage?.interestRate ?? 5, cashPledgeRatio: c.leverage?.cashPledgeRatio ?? 0.95, maxLtv: c.leverage?.maxLtv ?? 100, withdrawType: c.leverage?.withdrawType ?? 'PERCENT', withdrawValue: c.leverage?.withdrawValue ?? 0, inflationRate: c.leverage?.inflationRate ?? 0, interestType: c.leverage?.interestType ?? 'CAPITALIZED', ltvBasis: c.leverage?.ltvBasis ?? 'TOTAL_ASSETS' } },
  }
}

const MainApp = () => {
  const { t, language, setLanguage } = useTranslation()

  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const saved = localStorage.getItem('app_profiles')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return Array.isArray(parsed) ? parsed.map(migrateProfile) : CREATE_DEFAULT_PROFILES()
      } catch { /* ignore */ }
    }
    return CREATE_DEFAULT_PROFILES()
  })
  const [results, setResults] = useState<SimulationResult[]>([])
  const [isCalculated, setIsCalculated] = useState(false)
  const [showBenchmarks, setShowBenchmarks] = useState<boolean>(() => {
    const saved = localStorage.getItem('app_show_benchmark')
    return saved === 'true'
  })
  const [isCalculating, setIsCalculating] = useState(false)

  const [dataSources, setDataSources] = useState<DataSource[]>(() => {
    const saved = localStorage.getItem('app_data_sources')
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as DataSource[]
        const builtinIds = new Set(BUILT_IN_DATA_SOURCES.map((s) => s.id))
        return [...BUILT_IN_DATA_SOURCES, ...parsed.filter((s) => !builtinIds.has(s.id))]
      } catch { /* ignore */ }
    }
    const legacy = localStorage.getItem('app_saved_sources')
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy) as any[]
        const migrated: DataSource[] = [...BUILT_IN_DATA_SOURCES]
        for (const ls of parsed) {
          if (!ls.marketData || !Array.isArray(ls.marketData)) continue
          const parts = (ls.name || 'Asset').split('/')
          migrated.push({
            id: `migrated-${ls.id}-1`, name: parts[0]?.trim() || 'Asset1', multiplier: 1,
            data: ls.marketData.map((r: any) => ({ date: r.date, close: r.indexClose ?? 0, low: r.indexLow ?? 0 })),
          })
          migrated.push({
            id: `migrated-${ls.id}-2`, name: parts[1]?.trim() || 'Asset2', multiplier: 2,
            data: ls.marketData.map((r: any) => ({ date: r.date, close: r.leveragedClose ?? 0, low: r.leveragedLow ?? 0 })),
          })
        }
        return migrated
      } catch { /* ignore */ }
    }
    return BUILT_IN_DATA_SOURCES
  })

  const buildSimulationInput = useCallback(
    (profile: Profile): { assetData: Record<string, AssetDataRow[]>; multipliers: Record<string, number>; assets: AssetEntry[]; config: ProfileConfig } | null => {
      const assetData: Record<string, AssetDataRow[]> = {}
      const multipliers: Record<string, number> = {}
      for (const entry of profile.assets) {
        const source = dataSources.find((s) => s.id === entry.dataSourceId)
        if (!source) return null
        assetData[entry.dataSourceId] = source.data
        multipliers[entry.dataSourceId] = source.multiplier
      }
      return { assetData, multipliers, assets: profile.assets, config: profile.config }
    },
    [dataSources],
  )

  // Reporting Modal State
  const [reportResult, setReportResult] = useState<SimulationResult | null>(null)
  const [reportMarketData, setReportMarketData] = useState<Record<string, AssetDataRow[]> | null>(null)

  // View state: 'backtest' | 'monitor'
  const [currentView, setCurrentView] = useState<'backtest' | 'monitor'>('backtest')

  // Sidebar state
  const [isSidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('app_sidebar_open')
    return saved !== null ? saved === 'true' : true
  })

  // Auto-collapse on small screens initially
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }, [])

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('app_profiles', JSON.stringify(profiles))
  }, [profiles])

  useEffect(() => {
    localStorage.setItem('app_data_sources', JSON.stringify(dataSources))
  }, [dataSources])

  useEffect(() => {
    localStorage.setItem('app_show_benchmark', String(showBenchmarks))
  }, [showBenchmarks])

  useEffect(() => {
    localStorage.setItem('app_sidebar_open', String(isSidebarOpen))
  }, [isSidebarOpen])

  useEffect(() => {
    if (profiles.length === 0) {
      setResults([])
      setIsCalculated(false)
    }
  }, [profiles])

  const handleRunSimulation = useCallback(() => {
    setIsCalculating(true)

    setTimeout(() => {
      const newResults: SimulationResult[] = []

      for (const profile of profiles) {
        if (profile.enabled === false) continue
        const input = buildSimulationInput(profile)
        if (!input) continue
        const strategyFunc = getStrategyByType(profile.strategyType)
        newResults.push(
          runBacktest(input.assetData, input.multipliers, strategyFunc, input.assets, input.config, profile.name, profile.color),
        )
      }

      // Benchmarks
      if (showBenchmarks && profiles.length > 0) {
        const firstInput = buildSimulationInput(profiles[0])
        if (firstInput) {
          for (const assetId of Object.keys(firstInput.assetData)) {
            const source = dataSources.find((s) => s.id === assetId)
            if (!source) continue
            const benchAssets: AssetEntry[] = [
              { dataSourceId: assetId, targetWeight: 100, contributionWeight: 100, pledgeRatio: 0.7 },
            ]
            newResults.push(
              runBacktest(firstInput.assetData, firstInput.multipliers, getStrategyByType('NO_REBALANCE'), benchAssets, profiles[0].config, `Benchmark: ${source.name}`, '#64748b'),
            )
          }
        }
      }

      setResults(newResults)
      setIsCalculated(true)
      setIsCalculating(false)
      if (window.innerWidth < 1024) setSidebarOpen(false)
    }, 100)
  }, [profiles, showBenchmarks, buildSimulationInput, dataSources])

  useEffect(() => {
    handleRunSimulation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleViewDetails = (profileId: string) => {
    if (!isCalculated) return
    // results array only contains enabled profiles; count enabled profiles
    // up to (and including) the target to find the correct result index
    let resultIdx = 0
    for (const p of profiles) {
      if (p.id === profileId) {
        if (results[resultIdx]) {
          setReportResult(results[resultIdx])
          setReportMarketData(buildSimulationInput(p)?.assetData ?? null)
        }
        break
      }
      if (p.enabled !== false) resultIdx++
    }
  }

  const LangButton = ({ code, label }: { code: Language; label: string }) => (
    <button
      onClick={() => setLanguage(code)}
      className={`text-xs px-2 py-1 rounded transition-colors font-medium ${language === code ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-200'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans text-slate-900 relative overflow-x-hidden">
      {/* Financial Report Modal */}
      {reportResult && (
        <FinancialReportModal
          result={reportResult}
          marketData={reportMarketData}
          dataSources={dataSources}
          onClose={() => setReportResult(null)}
        />
      )}

      {/* Mobile/Tablet Portrait Header (< 1024px) */}
      <div className="lg:hidden bg-white p-4 border-b border-slate-200 sticky top-0 z-40 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="text-blue-600" />
            <h1 className="font-bold text-lg">
              {t('appTitle')}
              <span className="ml-1 text-[10px] font-mono text-slate-400 font-normal">
                v{version}
              </span>
            </h1>
          </div>

          <button
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${isSidebarOpen ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600'}`}
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Settings2 className="w-5 h-5" />}
            <span className="text-sm font-medium">{isSidebarOpen ? t('done') : t('profiles')}</span>
          </button>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400 font-medium">
            {isCalculated ? `${t('comparingPerformance')} ${results.length}` : ''}
          </span>
          <div className="flex gap-1">
            <LangButton code="en" label="EN" />
            <LangButton code="fr" label="FR" />
            <LangButton code="zh-CN" label="简" />
            <LangButton code="zh-TW" label="繁" />
          </div>
        </div>
      </div>

      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Calculating Overlay */}
      {isCalculating && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-[2px] z-[100] flex flex-col items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-2xl border border-slate-100 flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
              <Activity className="absolute inset-0 m-auto w-6 h-6 text-blue-600 animate-pulse" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-800 text-lg">{t('calculating')}</h3>
              <p className="text-sm text-slate-400 mt-1">{t('calculationDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Container */}
      <aside
        className={`
            fixed inset-y-0 left-0 z-50 
            bg-slate-50 border-r border-slate-200 
            flex flex-col flex-shrink-0
            transition-all duration-300 ease-in-out
            shadow-2xl lg:shadow-none
            
            /* Mobile Logic: slide in/out */
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            w-80
            
            /* Desktop Logic: Sticky, variable width, reset fixed positioning */
            lg:translate-x-0 lg:static lg:inset-auto lg:h-screen lg:sticky lg:top-0
            ${isSidebarOpen ? 'lg:w-80 xl:w-96 lg:border-r' : 'lg:w-0 lg:border-none lg:overflow-hidden'}
          `}
      >
        {/* Sidebar Header (Fixed within sidebar) */}
        <div className="flex-shrink-0 p-4 border-b border-slate-200 bg-slate-50 flex flex-col gap-4">
          <div className="hidden lg:flex justify-between items-center">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="text-blue-600 w-6 h-6" />
              <h1 className="font-bold text-xl tracking-tight text-slate-800">
                {t('appTitle')}
                <span className="ml-2 text-xs font-mono text-slate-400 font-normal tracking-normal">
                  v{version}
                </span>
              </h1>
            </div>

            {/* Desktop Collapse Button */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-slate-200 rounded-md text-slate-500 transition-colors"
              title="Collapse Sidebar"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>

          <div className="hidden lg:flex gap-1">
            <LangButton code="en" label="English" />
            <LangButton code="fr" label="Français" />
            <LangButton code="zh-CN" label="简体中文" />
            <LangButton code="zh-TW" label="繁體中文" />
          </div>

          <div className="flex bg-slate-200/50 p-1 rounded-xl gap-1">
            <button
              onClick={() => setCurrentView('backtest')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-bold transition-all ${
                currentView === 'backtest'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LineChart className="w-4 h-4" />
              {t('backtestView')}
            </button>
            <button
              onClick={() => setCurrentView('monitor')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-bold transition-all ${
                currentView === 'monitor'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Activity className="w-4 h-4" />
              {t('liveMonitor')}
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-8">
          {/* Wrapper to ensure width stability during transitions */}
          <div className="min-w-[18rem]">
            <ConfigPanel
              profiles={profiles}
              onProfilesChange={setProfiles}
              onRun={handleRunSimulation}
              onViewDetails={handleViewDetails}
              hasResults={isCalculated}
              showBenchmark={showBenchmarks}
              onShowBenchmarkChange={setShowBenchmarks}
              dataSources={dataSources}
              onSaveSource={(ds: DataSource) => setDataSources((prev) => [...prev, ds])}
              onDeleteSource={(id: string) => setDataSources((prev) => prev.filter((s) => s.id !== id || s.id.startsWith('builtin-')))}
              onImportData={({ profiles: importedProfiles, dataSources: importedSources }) => {
                setProfiles((prev) => {
                  const existing = new Map(prev.map((p) => [p.id, p]))
                  for (const p of importedProfiles) existing.set(p.id, migrateProfile(p))
                  return Array.from(existing.values())
                })
                if (importedSources) {
                  setDataSources((prev) => {
                    const existing = new Map(prev.map((d) => [d.id, d]))
                    for (const ds of importedSources) existing.set(ds.id, ds)
                    return Array.from(existing.values())
                  })
                }
              }}
            />

            <div className="mt-8 px-2 text-xs text-slate-400 leading-relaxed hidden lg:block">
              <p className="mt-2">{t('appDesc')}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-4 lg:p-8 relative">
        {/* Desktop Expand Button (Floating) */}
        <div
          className={`fixed top-6 left-6 z-30 transition-opacity duration-300 ${!isSidebarOpen && window.innerWidth >= 1024 ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="hidden lg:flex bg-white p-2.5 rounded-lg shadow-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-all"
            title="Open Sidebar"
          >
            <PanelLeftOpen className="w-6 h-6" />
          </button>
        </div>

        {currentView === 'monitor' ? (
          <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
            <MarketMonitor />
          </div>
        ) : isCalculated && results.length > 0 ? (
          <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
            <div className="mb-6 hidden lg:block">
              <h2 className="text-2xl font-bold text-slate-800">{t('simulationResults')}</h2>
              <p className="text-slate-500">
                {t('comparingPerformance')} {results.length} {t('profiles')}.
              </p>
            </div>
            <ResultsDashboard results={results} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
            {profiles.length === 0 ? t('addProfile') : t('runComparison')}
          </div>
        )}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <MainApp />
      <Analytics />
    </LanguageProvider>
  )
}
