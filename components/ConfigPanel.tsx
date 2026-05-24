import React, { useState } from 'react'
import { Profile, StrategyType, DataSource, AssetEntry, ProfileConfig } from '../types'
import {
  Settings,
  DollarSign,
  PieChart,
  TrendingUp,
  Plus,
  Trash2,
  Edit2,
  ArrowLeft,
  Check,
  Percent,
  Landmark,
  Info,
  AlertOctagon,
  FileText,
  Download,
  Upload,
  Copy,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from '../services/i18n'
import { parseTxtFile, aggregateToMonthly, monthlyPointsToAssetData } from '../services/dataLoader'

interface ConfigPanelProps {
  profiles: Profile[]
  onProfilesChange: (profiles: Profile[] | ((prev: Profile[]) => Profile[])) => void
  onRun: () => void
  onViewDetails: (profileId: string) => void
  hasResults: boolean
  showBenchmark: boolean
  onShowBenchmarkChange: (val: boolean) => void
  dataSources: DataSource[]
  onSaveSource: (source: DataSource) => void
  onDeleteSource: (sourceId: string) => void
  onImportData: (data: { profiles: Profile[]; dataSources: DataSource[] }) => void
}

// High-contrast palette for distinct chart lines
const PROFILE_COLORS = [
  '#2563eb', // Blue
  '#ea580c', // Orange
  '#16a34a', // Green
  '#9333ea', // Purple
  '#dc2626', // Red
  '#0891b2', // Cyan
  '#db2777', // Pink
  '#ca8a04', // Dark Yellow/Gold
  '#475569', // Slate
  '#4f46e5', // Indigo
]

const DEFAULT_PROFILE_CONFIG: ProfileConfig = {
  initialCapital: 10000,
  contributionAmount: 500,
  contributionIntervalMonths: 1,
  yearlyContributionMonth: 12,
  cashYieldAnnual: 2.0,
  leverage: {
    enabled: false,
    interestRate: 5.0,
    cashPledgeRatio: 0.95,
    maxLtv: 100.0,
    withdrawType: 'PERCENT',
    withdrawValue: 2.0,
    inflationRate: 0.0,
    interestType: 'CAPITALIZED',
    ltvBasis: 'TOTAL_ASSETS',
  },
  annualExpenseAmount: 200,
  cashCoverageYears: 15,
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  profiles,
  onProfilesChange,
  onRun,
  onViewDetails,
  hasResults,
  showBenchmark,
  onShowBenchmarkChange,
  dataSources,
  onSaveSource,
  onDeleteSource,
  onImportData,
}) => {
  const { t } = useTranslation()
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [hasChanged, setHasChanged] = useState(false)
  const [newSourceName, setNewSourceName] = useState('')
  const [newSourceMultiplier, setNewSourceMultiplier] = useState(1)
  const [fileContent, setFileContent] = useState<string | null>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setFileContent(reader.result as string)
    reader.readAsText(file)
  }

  const handleSaveSource = () => {
    if (!fileContent || !newSourceName || newSourceMultiplier < 1) return
    try {
      const daily = parseTxtFile(fileContent)
      const monthly = aggregateToMonthly(daily)
      const data = monthlyPointsToAssetData(monthly)
      const newSource: DataSource = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: newSourceName,
        multiplier: newSourceMultiplier,
        data,
      }
      onSaveSource(newSource)
      setNewSourceName('')
      setNewSourceMultiplier(1)
      setFileContent(null)
    } catch (e) {
      alert('Error parsing file: ' + (e as Error).message)
    }
  }

  // Reset change tracker when starting to edit a new profile
  React.useEffect(() => {
    if (editingProfileId) {
      setHasChanged(false)
    }
  }, [editingProfileId])

  const STRATEGY_OPTIONS: { value: StrategyType; label: string }[] = [
    { value: 'NO_REBALANCE', label: t('strat_noRebalance') },
    { value: 'REBALANCE', label: t('strat_rebalance') },
    { value: 'SMART', label: t('strat_smart') },
    { value: 'FLEXIBLE_1', label: t('strat_flex1') },
    { value: 'FLEXIBLE_2', label: t('strat_flex2') },
  ]

  const getStrategyLabel = (type: string) => {
    if (type === 'LUMP_SUM' || type === 'DCA') {
      return t('strat_noRebalance')
    }
    return STRATEGY_OPTIONS.find((o) => o.value === type)?.label || type
  }

  const getRiskLevel = (ltv: number) => {
    // Relationships based on user education:
    // 60% LTV = 167% Margin (Safe/Standard in TW)
    // 70% LTV = 143% Margin (Buffer zone)
    // 80% LTV = 125% Margin (High Risk)
    if (ltv <= 60)
      return { label: t('riskSafe'), color: 'text-green-600', bg: 'bg-green-100', icon: Check }
    if (ltv <= 70)
      return { label: t('riskModerate'), color: 'text-blue-600', bg: 'bg-blue-100', icon: Info }
    if (ltv <= 85)
      return {
        label: t('riskAggressive'),
        color: 'text-orange-600',
        bg: 'bg-orange-100',
        icon: AlertOctagon,
      }
    return { label: t('riskCritical'), color: 'text-red-600', bg: 'bg-red-100', icon: AlertOctagon }
  }

  const handleAddProfile = () => {
    const newId = Math.random().toString(36).substr(2, 9)
    const nextColor = PROFILE_COLORS[profiles.length % PROFILE_COLORS.length]

    const newProfile: Profile = {
      id: newId,
      name: `${t('profiles')} ${profiles.length + 1}`,
      color: nextColor,
      strategyType: 'NO_REBALANCE',
      assets: [],
      config: JSON.parse(JSON.stringify(DEFAULT_PROFILE_CONFIG)),
    }

    onProfilesChange([...profiles, newProfile])
    setEditingProfileId(newId)
  }

  const handleDeleteProfile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (profiles.length <= 1) return // Prevent deleting last profile
    onProfilesChange(profiles.filter((p) => p.id !== id))
    if (editingProfileId === id) setEditingProfileId(null)
  }

  const handleCopyProfile = (e: React.MouseEvent, profile: Profile) => {
    e.stopPropagation()
    const newId = Math.random().toString(36).substr(2, 9)
    const nextColor = PROFILE_COLORS[profiles.length % PROFILE_COLORS.length]

    const newProfile: Profile = {
      ...profile,
      id: newId,
      name: `${t('copyPrefix')}${profile.name}`,
      color: nextColor,
      assets: JSON.parse(JSON.stringify(profile.assets)),
      config: JSON.parse(JSON.stringify(profile.config)),
    }

    onProfilesChange([...profiles, newProfile])
    setEditingProfileId(newId)
  }

  const handleAutoGenerate = (baseProfile: Profile) => {
    const baseConfig = baseProfile.config
    const baseAssets = baseProfile.assets

    const candidates = [
      { q: 10, l: 0, name: 'Full Index' },
      { q: 9, l: 0, name: '901' },
      { q: 9, l: 1, name: '910' },
      { q: 8, l: 1, name: '811' },
      { q: 8, l: 0, name: '802' },
      { q: 8, l: 2, name: '820' },
      { q: 7, l: 1, name: '712' },
      { q: 7, l: 2, name: '721' },
      { q: 7, l: 0, name: '703' },
      { q: 7, l: 3, name: '730' },
      { q: 6, l: 2, name: '622' },
      { q: 6, l: 1, name: '613' },
      { q: 6, l: 3, name: '631' },
      { q: 6, l: 0, name: '604' },
      { q: 6, l: 4, name: '640' },
      { q: 5, l: 2, name: '523' },
      { q: 5, l: 1, name: '514' },
      { q: 5, l: 4, name: '541' },
      { q: 5, l: 0, name: '505' },
      { q: 5, l: 5, name: '550' },
      { q: 5, l: 3, name: '532' },
      { q: 4, l: 3, name: '433' },
      { q: 4, l: 4, name: '442' },
      { q: 4, l: 5, name: '451' },
      { q: 4, l: 1, name: '415' },
      { q: 4, l: 2, name: '424' },
      { q: 4, l: 0, name: '406' },
      { q: 4, l: 6, name: '460' },
    ]

    const strategies: { type: StrategyType; label: string }[] = [
      { type: 'NO_REBALANCE', label: 'Hold' },
      { type: 'REBALANCE', label: 'Reb' },
      { type: 'SMART', label: 'Smart' },
      { type: 'FLEXIBLE_1', label: 'Flex1' },
      { type: 'FLEXIBLE_2', label: 'Flex2' },
    ]

    const generatedProfiles: Profile[] = []

    const COLORS = [
      '#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea',
      '#0891b2', '#be123c', '#4d7c0f', '#854d0e', '#3730a3',
      '#0f766e', '#9f1239', '#15803d', '#a16207', '#5b21b6',
      '#0e7490', '#be185d', '#3f6212', '#713f12', '#4338ca',
    ]
    let colorIdx = 0
    const getNextColor = () => COLORS[colorIdx++ % COLORS.length]

    const primaryAsset = baseAssets[0]
    const secondaryAsset = baseAssets.length > 1 ? baseAssets[1] : null

    const hasDca = baseConfig.contributionAmount > 0
    const dcaList = hasDca ? candidates : [{ q: 0, l: 0, name: '' }]

    for (const init of candidates) {
      for (const dca of dcaList) {
        for (const strat of strategies) {
          const profileName = hasDca
            ? `${init.name}-${dca.name}-${strat.label}`
            : `${init.name}-${strat.label}`

          const newAssets: AssetEntry[] = []
          if (primaryAsset && init.q > 0) {
            newAssets.push({
              dataSourceId: primaryAsset.dataSourceId,
              targetWeight: init.q * 10,
              contributionWeight: dca.q * 10,
              pledgeRatio: primaryAsset.pledgeRatio,
            })
          }
          if (secondaryAsset && init.l > 0) {
            newAssets.push({
              dataSourceId: secondaryAsset.dataSourceId,
              targetWeight: init.l * 10,
              contributionWeight: dca.l * 10,
              pledgeRatio: secondaryAsset.pledgeRatio,
            })
          }

          generatedProfiles.push({
            id: profileName,
            name: profileName,
            color: getNextColor(),
            strategyType: strat.type,
            assets: newAssets,
            config: {
              ...baseConfig,
              annualExpenseAmount: baseConfig.annualExpenseAmount ?? 30000,
              cashCoverageYears: baseConfig.cashCoverageYears ?? 15,
            },
          })
        }
      }
    }

    const totalCount = generatedProfiles.length
    const confirmMsg =
      t('confirmAutoGenerate') || `This will generate ${totalCount} combinations. Continue?`

    if (window.confirm(confirmMsg)) {
      onProfilesChange((prev) => [...prev, ...generatedProfiles])
    }
  }

  const updateProfile = (id: string, updates: Partial<Profile> | Partial<ProfileConfig>) => {
    onProfilesChange((prevProfiles) =>
      prevProfiles.map((p) => {
        if (p.id !== id) return p
        const isConfigUpdate = Object.keys(updates).some((k) => k in DEFAULT_PROFILE_CONFIG)
        if (isConfigUpdate) {
          return { ...p, config: { ...p.config, ...updates } }
        }
        return { ...p, ...updates }
      }),
    )
    setHasChanged(true)
  }
  const updateLeverage = (id: string, updates: Partial<ProfileConfig['leverage']>) => {
    onProfilesChange((prevProfiles) =>
      prevProfiles.map((p) => {
        if (p.id !== id) return p
        return {
          ...p,
          config: {
            ...p.config,
            leverage: { ...p.config.leverage, ...updates },
          },
        }
      }),
    )
    setHasChanged(true)
  }

  const handleExport = () => {
    const data = JSON.stringify({ version: 1, profiles, dataSources }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `profiles_${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const raw = JSON.parse(event.target?.result as string)
        if (Array.isArray(raw)) {
          onProfilesChange(raw)
        } else if (raw.version === 1 && Array.isArray(raw.profiles)) {
          onImportData({
            profiles: raw.profiles,
            dataSources: Array.isArray(raw.dataSources) ? raw.dataSources : [],
          })
        } else {
          alert('Invalid profiles data')
        }
      } catch (err) {
        console.error('Import failed:', err)
        alert('Invalid profiles data')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleClearAll = () => {
    if (window.confirm(t('confirmClearAll'))) {
      onProfilesChange([])
      setEditingProfileId(null)
    }
  }

  // --------------------------------------------------------------------------
  // Edit View
  // --------------------------------------------------------------------------
  if (editingProfileId) {
    const profile = profiles.find((p) => p.id === editingProfileId)
    if (!profile) return null

    // Calculate Maintenance Ratio for UI display
    const currentMaxLtv = profile.config.leverage?.maxLtv ?? 100
    const maintenanceRatio = currentMaxLtv > 0 ? (100 / currentMaxLtv) * 100 : 0
    const riskInfo = getRiskLevel(currentMaxLtv)

    const addAsset = (dataSourceId: string) => {
      updateProfile(profile.id, {
        assets: [...profile.assets, { dataSourceId, targetWeight: 0, contributionWeight: 0, pledgeRatio: 0.7 }],
      })
    }

    const removeAsset = (index: number) => {
      updateProfile(profile.id, {
        assets: profile.assets.filter((_, i) => i !== index),
      })
    }

    const updateAsset = (index: number, updates: Partial<AssetEntry>) => {
      updateProfile(profile.id, {
        assets: profile.assets.map((a, i) => (i === index ? { ...a, ...updates } : a)),
      })
    }

    return (
      <div className="flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center gap-2 mb-4 text-slate-800">
          <button
            onClick={() => setEditingProfileId(null)}
            className="p-1 hover:bg-slate-200 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h2 className="text-lg font-bold">{t('editProfile')}</h2>
        </div>

        <div className="space-y-6">
          {/* Identity */}
          <label
            htmlFor="profile-name-input"
            className="text-xs font-semibold text-slate-500 uppercase"
          >
            {t('profileName')}
          </label>
          <input
            id="profile-name-input"
            type="text"
            value={profile.name}
            onChange={(e) => updateProfile(profile.id, { name: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
          />

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">
              {t('chartColor')}
            </label>
            <div className="flex gap-2 flex-wrap">
              {PROFILE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateProfile(profile.id, { color: c })}
                  className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${profile.color === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>



          {/* Strategy */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">
              {t('strategy')}
            </label>
            <select
              value={profile.strategyType}
              onChange={(e) =>
                updateProfile(profile.id, { strategyType: e.target.value as StrategyType })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              {STRATEGY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Living Expenses & Cash Buffer (Only for Flexible Strategies) */}
          {(profile.strategyType === 'FLEXIBLE_1' || profile.strategyType === 'FLEXIBLE_2') && (
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {t('spending_buffer')}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">
                    {t('config_expenseAmount')}
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="number"
                      value={profile.config.annualExpenseAmount ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? undefined : Number(e.target.value)
                        updateProfile(profile.id, { annualExpenseAmount: val })
                      }}
                      placeholder="200"
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">
                    {t('config_coverageYears')}
                  </label>
                  <div className="relative">
                    <PieChart className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="number"
                      value={profile.config.cashCoverageYears ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? undefined : Number(e.target.value)
                        updateProfile(profile.id, { cashCoverageYears: val })
                      }}
                      placeholder="15"
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <hr className="border-slate-100" />

          {/* Capital */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <DollarSign className="w-4 h-4" /> {t('initialCapital')}
              </label>
              <input
                id="initial-capital-input"
                type="number"
                value={profile.config.initialCapital}
                onChange={(e) =>
                  updateProfile(profile.id, { initialCapital: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Percent className="w-4 h-4" /> {t('cashYield')}
              </label>
              <input
                type="number"
                step="0.1"
                value={profile.config.cashYieldAnnual}
                onChange={(e) =>
                  updateProfile(profile.id, { cashYieldAnnual: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Contribution */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <TrendingUp className="w-4 h-4 text-green-600" /> {t('recurringInv')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold">
                  {t('amount')}
                </label>
                <input
                  type="number"
                  value={profile.config.contributionAmount}
                  onChange={(e) =>
                    updateProfile(profile.id, { contributionAmount: Number(e.target.value) })
                  }
                  className="w-full px-2 py-2 border border-slate-300 rounded-lg outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold">
                  {t('freq')}
                </label>
                <select
                  value={profile.config.contributionIntervalMonths}
                  onChange={(e) =>
                    updateProfile(profile.id, {
                      contributionIntervalMonths: Number(e.target.value),
                    })
                  }
                  className="w-full px-2 py-2 border border-slate-300 rounded-lg outline-none bg-white text-sm"
                >
                  <option value={1}>{t('monthly')}</option>
                  <option value={3}>{t('quarterly')}</option>
                  <option value={12}>{t('yearly')}</option>
                </select>
              </div>
            </div>
            {/* Month Selector - Only show when frequency is Yearly */}
            {profile.config.contributionIntervalMonths === 12 && (
              <div className="mt-2">
                <label className="text-[10px] text-slate-500 uppercase font-bold">
                  {t('contributionMonth')}
                </label>
                <select
                  value={profile.config.yearlyContributionMonth || 12}
                  onChange={(e) =>
                    updateProfile(profile.id, { yearlyContributionMonth: Number(e.target.value) })
                  }
                  className="w-full px-2 py-2 border border-slate-300 rounded-lg outline-none bg-white text-sm"
                >
                  <option value={1}>{t('month_jan')}</option>
                  <option value={2}>{t('month_feb')}</option>
                  <option value={3}>{t('month_mar')}</option>
                  <option value={4}>{t('month_apr')}</option>
                  <option value={5}>{t('month_may')}</option>
                  <option value={6}>{t('month_jun')}</option>
                  <option value={7}>{t('month_jul')}</option>
                  <option value={8}>{t('month_aug')}</option>
                  <option value={9}>{t('month_sep')}</option>
                  <option value={10}>{t('month_oct')}</option>
                  <option value={11}>{t('month_nov')}</option>
                  <option value={12}>{t('month_dec')}</option>
                </select>
              </div>
            )}
          </div>

          {/* Asset List */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase">{t('assets') || 'Assets'}</h3>
            {profile.assets.map((asset, i) => {
              const source = dataSources.find((s) => s.id === asset.dataSourceId)
              return (
                <div key={asset.dataSourceId} className="border rounded p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{source?.name || asset.dataSourceId}</span>
                    <span className="text-xs text-gray-500">{source?.multiplier}x</span>
                    <button onClick={() => removeAsset(i)} className="text-red-500 text-xs">Remove</button>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">{t('targetWeight') || 'Target Weight'}: {asset.targetWeight}%</label>
                    <input type="range" min={0} max={100} value={asset.targetWeight}
                      onChange={(e) => updateAsset(i, { targetWeight: Number(e.target.value) })} className="w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">{t('contributionWeight') || 'Contribution Weight'}: {asset.contributionWeight}%</label>
                    <input type="range" min={0} max={100} value={asset.contributionWeight}
                      onChange={(e) => updateAsset(i, { contributionWeight: Number(e.target.value) })} className="w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">{t('pledgeRatio') || 'Pledge Ratio'}: {(asset.pledgeRatio * 100).toFixed(0)}%</label>
                    <input type="range" min={0} max={100} value={asset.pledgeRatio * 100}
                      onChange={(e) => updateAsset(i, { pledgeRatio: Number(e.target.value) / 100 })} className="w-full" />
                  </div>
                </div>
              )
            })}

            {/* Add Asset */}
            <div className="flex gap-2">
              <select
                value=""
                onChange={(e) => { if (e.target.value) addAsset(e.target.value) }}
                className="flex-1 border rounded p-1 text-sm"
              >
                <option value="">+ {t('addAsset') || 'Add Asset'}</option>
                {dataSources
                  .filter((ds) => !profile.assets.some((a) => a.dataSourceId === ds.id))
                  .map((ds) => (
                    <option key={ds.id} value={ds.id}>{ds.name} ({ds.multiplier}x)</option>
                  ))}
              </select>
            </div>

            {/* Cash display */}
            <div className="text-xs text-gray-500">
              {t('cashAllocation') || 'Cash allocation'}: {Math.max(0, 100 - profile.assets.reduce((s, a) => s + a.targetWeight, 0))}%
              ({t('remainderAfterWeights') || 'remainder after target weights'})
            </div>
          </div>

          {/* Stock Pledge / Leverage */}
          <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100 space-y-4 mt-6">
            <div className="flex items-center justify-between text-sm font-medium text-yellow-800">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4" /> {t('stockPledge')}
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.config.leverage?.enabled || false}
                  onChange={(e) => updateLeverage(profile.id, { enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-yellow-600"></div>
              </label>
            </div>

            {profile.config.leverage?.enabled && (
              <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                {/* Row 1: Interest Rate & Max LTV */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[10px] text-yellow-700 uppercase font-bold">
                      {t('loanRate')}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={profile.config.leverage.interestRate}
                      onChange={(e) =>
                        updateLeverage(profile.id, { interestRate: Number(e.target.value) })
                      }
                      className="w-full px-2 py-2 border border-yellow-200 rounded-lg outline-none"
                    />
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-yellow-200">
                    <div className="flex justify-between items-center mb-1">
                      <label
                        className="text-[10px] text-yellow-700 uppercase font-bold flex items-center gap-1"
                        title="If Debt > This % of Collateral, liquidation occurs"
                      >
                        {t('maxLtv')} <Info className="w-3 h-3 text-yellow-400" />
                      </label>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${riskInfo.color} ${riskInfo.bg}`}
                      >
                        <riskInfo.icon className="w-3 h-3" /> {riskInfo.label}
                      </span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="100"
                        value={profile.config.leverage.maxLtv}
                        onChange={(e) =>
                          updateLeverage(profile.id, { maxLtv: Number(e.target.value) })
                        }
                        className="w-20 px-2 py-2 border border-slate-200 rounded-lg outline-none font-mono text-center font-bold text-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                      <div className="flex-1 flex flex-col justify-center pl-2 border-l border-slate-100">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">
                          {t('maintMargin')}
                        </span>
                        <span className="text-lg font-bold text-slate-600 font-mono leading-none">
                          {maintenanceRatio.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 leading-tight">{t('ltvNote')}</p>
                  </div>
                </div>

                {/* Row 1.5: LTV Basis */}
                <div>
                  <label className="text-[10px] text-yellow-700 uppercase font-bold mb-1 block">
                    {t('ltvBasis')}
                  </label>
                  <div className="flex bg-white rounded-lg border border-yellow-200 p-1">
                    <button
                      className={`flex-1 py-1 text-xs font-medium rounded ${profile.config.leverage.ltvBasis === 'TOTAL_ASSETS' ? 'bg-yellow-100 text-yellow-800' : 'text-slate-500 hover:bg-slate-50'}`}
                      onClick={() => updateLeverage(profile.id, { ltvBasis: 'TOTAL_ASSETS' })}
                    >
                      {t('ltvTotalAssets')}
                    </button>
                    <button
                      className={`flex-1 py-1 text-xs font-medium rounded ${profile.config.leverage.ltvBasis === 'COLLATERAL' ? 'bg-yellow-100 text-yellow-800' : 'text-slate-500 hover:bg-slate-50'}`}
                      onClick={() => updateLeverage(profile.id, { ltvBasis: 'COLLATERAL' })}
                    >
                      {t('ltvCollateral')}
                    </button>
                  </div>
                </div>

                {/* Row 2: Cash Pledge Ratio */}
                <div className="bg-yellow-100/50 p-2 rounded-lg">
                  <div>
                    <label className="text-[10px] text-yellow-800 uppercase font-bold">
                      {t('pledgeRatioCash')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={profile.config.leverage.cashPledgeRatio ?? 0.95}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateLeverage(profile.id, { cashPledgeRatio: Number(e.target.value) })
                      }
                      className="w-full px-2 py-1.5 border border-yellow-200 rounded outline-none text-sm"
                    />
                  </div>
                </div>

                {/* Row 2.5: Interest Payment Type */}
                <div>
                  <label className="text-[10px] text-yellow-700 uppercase font-bold mb-1 block">
                    {t('interestType')}
                  </label>
                  <select
                    value={profile.config.leverage.interestType || 'CAPITALIZED'}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      updateLeverage(profile.id, {
                        interestType: e.target
                          .value as Profile['config']['leverage']['interestType'],
                      })
                    }
                    className="w-full bg-white border border-yellow-200 rounded-lg px-2 py-2 text-sm outline-none"
                  >
                    <option value="MONTHLY">{t('interestMonthly')}</option>
                    <option value="MATURITY">{t('interestMaturity')}</option>
                    <option value="CAPITALIZED">{t('interestCapitalized')}</option>
                  </select>
                </div>

                {/* Row 3: Withdrawal Settings */}
                <div>
                  <label className="text-[10px] text-yellow-700 uppercase font-bold mb-1 block">
                    {t('annualCashOut')}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={profile.config.leverage.withdrawType}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        updateLeverage(profile.id, {
                          withdrawType: e.target
                            .value as Profile['config']['leverage']['withdrawType'],
                        })
                      }
                      className="bg-white border border-yellow-200 rounded-lg px-2 text-sm outline-none w-28"
                    >
                      <option value="PERCENT">{t('percentOfQqq')}</option>
                      <option value="FIXED">{t('fixedAmount')}</option>
                    </select>
                    <input
                      type="number"
                      step="0.1"
                      value={profile.config.leverage.withdrawValue}
                      onChange={(e) =>
                        updateLeverage(profile.id, { withdrawValue: Number(e.target.value) })
                      }
                      className="w-full px-2 py-2 border border-yellow-200 rounded-lg outline-none"
                    />
                  </div>
                  {profile.config.leverage.withdrawType === 'FIXED' && (
                    <div className="mt-2">
                      <label className="text-[10px] text-yellow-700 uppercase font-bold mb-1 block">
                        {t('inflationRate')}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={profile.config.leverage.inflationRate || 0}
                        onChange={(e) =>
                          updateLeverage(profile.id, { inflationRate: Number(e.target.value) })
                        }
                        className="w-full px-2 py-2 border border-yellow-200 rounded-lg outline-none"
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-yellow-600 mt-2 italic leading-tight">
                    {t('leverageWarning')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setEditingProfileId(null)
              if (hasChanged) {
                onRun()
              }
            }}
            className="w-full py-2 bg-slate-800 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-slate-900 mt-4"
          >
            <Check className="w-4 h-4" /> {t('done')}
          </button>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // List View
  // --------------------------------------------------------------------------
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4 text-slate-800">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-bold">{t('profiles')}</h2>
        </div>
        {profiles.length > 0 && (
          <button
            onClick={handleClearAll}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex items-center gap-1.5 group"
            title={t('clearAll')}
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-xs font-semibold hidden group-hover:inline">{t('clearAll')}</span>
          </button>
        )}
      </div>

      {/* Data Sources Management */}
      <div className="mb-6 p-4 bg-white rounded-xl border border-slate-200 space-y-3 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <Upload className="w-3.5 h-3.5" /> {t('dataSource')}
        </h3>

        {dataSources.filter((ds) => !ds.id.startsWith('builtin-')).length === 0 && (
          <p className="text-xs text-slate-400 italic">{t('noDataSources') || 'No custom sources yet'}</p>
        )}
        {dataSources.filter((ds) => !ds.id.startsWith('builtin-')).map((ds) => (
          <div
            key={ds.id}
            className="flex items-center justify-between p-2 border rounded mb-1"
          >
            <div>
              <span className="font-medium text-sm">{ds.name}</span>
              <span className="text-xs text-gray-500 ml-2">{ds.multiplier}x</span>
              <span className="text-xs text-gray-400 ml-2">{ds.data.length} months</span>
            </div>
            <button
              onClick={() => onDeleteSource(ds.id)}
              className="text-red-500 text-xs hover:text-red-700"
            >
              {t('deleteProfile') || 'Delete'}
            </button>
          </div>
        ))}

        {/* Add New Data Source */}
        <details className="rounded-lg border border-slate-200 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex items-center gap-2 p-3 text-sm font-medium text-slate-600 cursor-pointer hover:bg-slate-50 rounded-lg select-none">
            <Plus className="w-4 h-4" /> {t('addDataSource') || 'Add New Data Source'}
          </summary>
          <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
            <input
              type="text"
              placeholder={t('dataSourceNamePlaceholder') || 'Asset name (e.g. SPY)'}
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              className="w-full border rounded p-1 text-sm"
            />
            <input
              type="number"
              placeholder={t('multiplierPlaceholder') || 'Multiplier (1, 2, 3...)'}
              min={1}
              step={1}
              value={newSourceMultiplier}
              onChange={(e) => setNewSourceMultiplier(Number(e.target.value))}
              className="w-full border rounded p-1 text-sm"
            />
            <input
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              className="text-sm"
            />
            <p className="text-[10px] text-slate-400">Format: dates (YYYYMMDD) on line 1, prices on line 2; or dates then prices on one line separated by a space</p>
            <button
              onClick={handleSaveSource}
              disabled={!newSourceName || newSourceMultiplier < 1 || !fileContent}
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
            >
              {t('save')}
            </button>
          </div>
        </details>
      </div>

      <div className="space-y-4">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            data-testid="profile-card"
            onClick={() => setEditingProfileId(profile.id)}
            className="group relative rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer bg-white overflow-hidden"
            style={{ borderLeft: `4px solid ${profile.color}` }}
          >
            {/* Header: Name and Management Actions */}
            <div className="flex justify-between items-center px-4 pt-3 mb-1">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="font-bold text-slate-800 text-sm truncate">{profile.name}</span>
              </div>
              <div className="flex gap-0.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingProfileId(profile.id)
                  }}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title={t('editProfile')}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => handleDeleteProfile(e, profile.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title={t('deleteProfile')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Content: Strategy and Allocation details */}
            <div className="px-4 pb-3">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-wider">
                {getStrategyLabel(profile.strategyType)}
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
                {profile.assets.map((asset) => {
                  const source = dataSources.find((s) => s.id === asset.dataSourceId)
                  return (
                    <span key={asset.dataSourceId} className="text-[10px] font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                      {source?.name || asset.dataSourceId}: {asset.targetWeight}% / {asset.contributionWeight}%
                    </span>
                  )
                })}

                {profile.config.leverage?.enabled && (
                  <div className="flex items-center gap-1 text-[10px] font-mono text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-100">
                    <Landmark className="w-3 h-3" />
                    <span>{profile.config.leverage.maxLtv}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer: Action Ribbon */}
            <div
              className={`flex items-center justify-between border-t border-slate-50 bg-slate-50/50 px-2 py-1 transition-opacity ${
                editingProfileId === profile.id
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <div className="flex gap-1">
                {hasResults && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onViewDetails(profile.id)
                    }}
                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white rounded shadow-sm transition-all text-[10px] font-bold flex items-center gap-1"
                    title={t('viewDetails')}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {t('details')}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAutoGenerate(profile)
                  }}
                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded shadow-sm transition-all text-[10px] font-bold flex items-center gap-1"
                  title={t('autoGenerate')}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {t('generate')}
                </button>
              </div>
              <button
                onClick={(e) => handleCopyProfile(e, profile)}
                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white rounded shadow-sm transition-all"
                title={t('copyProfile')}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={handleAddProfile}
          className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-500 transition-colors"
        >
          <Plus className="w-5 h-5" /> {t('addProfile')}
        </button>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            onClick={handleExport}
            className="flex-1 py-2 px-3 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            {t('exportData')}
          </button>
          <div className="relative flex-1">
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="absolute inset-0 opacity-0 cursor-pointer w-full"
            />
            <button className="w-full h-full py-2 px-3 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 text-xs font-semibold">
              <Upload className="w-3.5 h-3.5" />
              {t('importData')}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 px-1 py-2 border-t border-slate-100">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showBenchmark}
              onChange={(e) => onShowBenchmarkChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ml-3 text-xs font-bold text-slate-600">{t('showBenchmark')}</span>
          </label>
        </div>

        <button
          onClick={onRun}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
        >
          {t('runComparison')}
        </button>
      </div>
    </div>
  )
}
