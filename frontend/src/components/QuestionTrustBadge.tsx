import { ShieldCheck, CheckCircle2, Clock } from 'lucide-react';
import { deriveTrustLevel, type QuestionTrustLevel } from '@/lib/question-trust';

const TRUST_STYLE: Record<QuestionTrustLevel, string> = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  approved: 'bg-sky-50 text-sky-700 border-sky-100',
  pending: 'bg-slate-50 text-slate-500 border-slate-200',
};

const TRUST_LABEL: Record<QuestionTrustLevel, string> = {
  verified: 'AI-verified solution',
  approved: 'Reviewed solution',
  pending: 'Pending review',
};

const TRUST_ICON: Record<QuestionTrustLevel, typeof ShieldCheck> = {
  verified: ShieldCheck,
  approved: CheckCircle2,
  pending: Clock,
};

interface QuestionTrustBadgeProps {
  status: string;
  verificationStatus: string;
  className?: string;
}

export default function QuestionTrustBadge({ status, verificationStatus, className = '' }: QuestionTrustBadgeProps) {
  const level = deriveTrustLevel({ status, verificationStatus });
  const Icon = TRUST_ICON[level];

  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${TRUST_STYLE[level]} ${className}`}>
      <Icon className="w-3 h-3" /> {TRUST_LABEL[level]}
    </span>
  );
}
