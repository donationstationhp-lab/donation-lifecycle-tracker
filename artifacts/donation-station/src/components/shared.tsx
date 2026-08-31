import { Cloud, Snowflake, Thermometer, Box, FileCheck, Warehouse, Send, Sparkles, TrendingUp, Clock3, AlertOctagon, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DonationItemTier, DonationItemStage, DonationItemCondition, DonationItemTemperatureZone, DonorStage } from '@workspace/api-client-react';

export function TierBadge({ tier }: { tier: DonationItemTier }) {
  const styles = {
    T: 'bg-tier-t/10 text-tier-t border-tier-t/20',
    I: 'bg-tier-i/10 text-tier-i border-tier-i/20',
    E: 'bg-tier-e/10 text-tier-e border-tier-e/20',
    R: 'bg-tier-r/10 text-tier-r border-tier-r/20',
  };

  const labels = {
    T: 'Time',
    I: 'Intelligence',
    E: 'Energy',
    R: 'Resources',
  };

  return (
    <Badge variant="outline" className={`font-semibold tracking-wide rounded-sm px-2 py-0.5 ${styles[tier]}`}>
      {tier} • {labels[tier]}
    </Badge>
  );
}

export function StageChip({ stage }: { stage: DonationItemStage }) {
  const config = {
    intake: { icon: Box, label: 'Intake', style: 'bg-blue-50 text-blue-700 border-blue-200' },
    qc: { icon: FileCheck, label: 'Quality Control', style: 'bg-purple-50 text-purple-700 border-purple-200' },
    storage: { icon: Warehouse, label: 'Storage', style: 'bg-amber-50 text-amber-700 border-amber-200' },
    distributed: { icon: Send, label: 'Distributed', style: 'bg-green-50 text-green-700 border-green-200' },
  };

  const { icon: Icon, label, style } = config[stage];

  return (
    <Badge variant="outline" className={`flex items-center gap-1 px-2 py-0.5 ${style}`}>
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}

export function ConditionChip({ condition }: { condition: DonationItemCondition }) {
  const styles = {
    good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    fair: 'bg-amber-50 text-amber-700 border-amber-200',
    poor: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <Badge variant="outline" className={`capitalize px-2 py-0.5 ${styles[condition]}`}>
      {condition}
    </Badge>
  );
}

export function DonorStageChip({ stage }: { stage: DonorStage }) {
  const config = {
    prospect: { icon: Sparkles, label: 'Prospect', style: 'bg-gray-50 text-gray-700 border-gray-200' },
    'first-gift': { icon: Box, label: 'First Gift', style: 'bg-blue-50 text-blue-700 border-blue-200' },
    active: { icon: TrendingUp, label: 'Active', style: 'bg-green-50 text-green-700 border-green-200' },
    lapsing: { icon: Clock3, label: 'Lapsing', style: 'bg-amber-50 text-amber-700 border-amber-200' },
    lapsed: { icon: AlertOctagon, label: 'Lapsed', style: 'bg-red-50 text-red-700 border-red-200' },
    reactivated: { icon: RotateCcw, label: 'Reactivated', style: 'bg-purple-50 text-purple-700 border-purple-200' },
  } satisfies Record<DonorStage, { icon: typeof Box; label: string; style: string }>;

  const { icon: Icon, label, style } = config[stage];

  return (
    <Badge variant="outline" className={`flex items-center gap-1 px-2 py-0.5 ${style}`}>
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}

export function TempZoneIcon({ zone }: { zone?: DonationItemTemperatureZone | null }) {
  if (!zone) return null;
  
  if (zone === 'frozen') {
    return <Snowflake className="w-4 h-4 text-blue-500" aria-label="Frozen" />;
  }
  if (zone === 'refrigerated') {
    return <Thermometer className="w-4 h-4 text-cyan-500" aria-label="Refrigerated" />;
  }
  return <Cloud className="w-4 h-4 text-gray-500" aria-label="Ambient" />;
}

export function NumerologyReading({ reading }: { reading?: string | null }) {
  if (!reading) return null;
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-950 text-indigo-100 border border-indigo-800 shadow-inner w-fit">
      <svg className="w-3 h-3 text-indigo-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      <span className="text-xs font-mono font-bold tracking-wider">{reading}</span>
    </div>
  );
}
