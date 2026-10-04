import {
  ENACTED_STATUS_META,
  LEGAL_EFFECT_META,
  REGULATORY_DATASET,
  RESTRICTIVE_MECHANISMS,
  triggerCategoryLabel,
  type RegulatoryActivityLevel,
  type StatePolicyAction,
} from '../../lib/regulatory'
import { useSiteStore } from '../../store/useSiteStore'

const ACTIVITY_LABEL: Record<RegulatoryActivityLevel, string> = {
  low: 'LOW',
  elevated: 'ELEVATED',
  high: 'HIGH',
  'very-high': 'VERY HIGH',
}

const MECHANISM_LABELS: Record<string, string> = {
  statewide_moratorium: 'Statewide moratorium',
  local_moratorium_authorization: 'Local moratorium authorization',
  local_moratorium_preemption: 'Local moratorium preemption',
  permitting_restriction: 'Permitting restriction',
  utility_large_load_restriction: 'Utility large-load restriction',
  incentive_restriction: 'Incentive restriction',
  reporting_disclosure: 'Reporting / disclosure',
  other: 'Other',
}

function PolicyRow({ policy }: { policy: StatePolicyAction }) {
  return (
    <div className="reg-policy">
      <div className="reg-policy__head">
        <span className="reg-policy__bill">
          {policy.primarySourceUrl ? (
            <a href={policy.primarySourceUrl} target="_blank" rel="noreferrer">
              {policy.bill}
            </a>
          ) : (
            policy.bill
          )}
        </span>
        <span
          className={`reg-policy__effect reg-policy__effect--${policy.legalEffectStatus}`}
        >
          {LEGAL_EFFECT_META[policy.legalEffectStatus]}
        </span>
      </div>
      <div className="reg-policy__sub">
        {policy.policyMechanism
          ? MECHANISM_LABELS[policy.policyMechanism] ?? policy.policyMechanism
          : 'Mechanism unclassified'}
        {policy.lastActionDateIso ? ` · last action ${policy.lastActionDateIso}` : ''}
      </div>
    </div>
  )
}

/**
 * REGULATORY / APPROVAL CONTEXT for the selected site, from the REAL
 * Moratorium Nation 2026 dataset. State policy applies because the state
 * is known; local records are centroid-distance DISCOVERY context only —
 * never legal applicability, never a screening constraint, and not part
 * of any suitability score.
 */
export default function RegulatoryContext() {
  const selectedSite = useSiteStore((s) => s.selectedSite)
  const assessment = useSiteStore((s) => s.regulatoryAssessment)

  if (!selectedSite) return null

  const siteKey = `${selectedSite.latitude.toFixed(5)},${selectedSite.longitude.toFixed(5)}`
  const result = assessment?.key === siteKey ? assessment.result : null

  if (!result || result === 'loading') {
    return (
      <div>
        <div className="panel__subheading">
          Regulatory / Approval Context{' '}
          <span className="tag tag--real">Real site data</span>
        </div>
        <p className="panel__placeholder">Loading regulatory records…</p>
      </div>
    )
  }
  if (result === 'error') {
    return (
      <div>
        <div className="panel__subheading">
          Regulatory / Approval Context{' '}
          <span className="tag tag--real">Real site data</span>
        </div>
        <p className="panel__placeholder">
          Regulatory data unavailable — Moratorium Nation files failed to load
        </p>
      </div>
    )
  }

  const { stateName, nearby, statePolicies, indicator } = result
  const inForce = statePolicies.filter((p) => p.legalEffectStatus === 'in_force')
  const inForceRestrictive = inForce.filter(
    (p) => p.policyMechanism !== null && RESTRICTIVE_MECHANISMS.has(p.policyMechanism),
  )
  const proposed = statePolicies.filter((p) => p.legalEffectStatus === 'proposed')
  // Enacted temporary measures the dataset marks "unknown" until verified.
  const unverified = statePolicies.filter(
    (p) => p.legalEffectStatus === 'unknown' && p.billStatusCategory === 'enacted',
  )
  const shownPolicies = [...inForce, ...unverified.slice(0, 3), ...proposed.slice(0, 2)]

  const closest = nearby.closest
  const closestMeta = closest
    ? ENACTED_STATUS_META[closest.record.enactedStatus]
    : null

  return (
    <div>
      <div className="panel__subheading">
        Regulatory / Approval Context{' '}
        <span className="tag tag--real">Real site data</span>
      </div>

      <div className="site-facts">
        <div className="site-fact">
          <span>Regulatory Activity</span>
          <span className={`reg-level reg-level--${indicator.level}`}>
            {ACTIVITY_LABEL[indicator.level]}
          </span>
        </div>
      </div>
      <p className="sim-note">
        {indicator.reasons.join('. ')}. Contextual indicator only — not a
        legal risk score, not approval probability, and not part of
        suitability scoring.
      </p>

      <div className="panel__subheading panel__subheading--minor">
        State Policy{stateName ? ` · ${stateName}` : ''}
      </div>
      {stateName === null ? (
        <p className="panel__placeholder">
          State could not be resolved for this site
        </p>
      ) : statePolicies.length === 0 ? (
        <p className="panel__placeholder">
          No state data-center policy actions recorded
        </p>
      ) : (
        <>
          <div className="site-facts">
            <div className="site-fact">
              <span>In force</span>
              <span>
                {inForce.length}
                {inForceRestrictive.length > 0
                  ? ` (${inForceRestrictive.length} restrictive)`
                  : ''}
              </span>
            </div>
            <div className="site-fact">
              <span>Enacted, effect unverified</span>
              <span>{unverified.length}</span>
            </div>
            <div className="site-fact">
              <span>Proposed (not law)</span>
              <span>{proposed.length}</span>
            </div>
          </div>
          {shownPolicies.map((p) => (
            <PolicyRow key={p.policyActionId} policy={p} />
          ))}
        </>
      )}

      <div className="panel__subheading panel__subheading--minor">
        Nearby Jurisdictional Activity
      </div>
      <div className="site-facts">
        <div className="site-fact">
          <span>Active/extended within 10 mi</span>
          <span>{nearby.currentCounts.within10}</span>
        </div>
        <div className="site-fact">
          <span>Active/extended within 25 mi</span>
          <span>{nearby.currentCounts.within25}</span>
        </div>
        <div className="site-fact">
          <span>Active/extended within 50 mi</span>
          <span>{nearby.currentCounts.within50}</span>
        </div>
        <div className="site-fact">
          <span>Pending within 50 mi</span>
          <span>{nearby.pendingWithin50}</span>
        </div>
        {closest && closestMeta && (
          <>
            <div className="site-fact">
              <span>Closest jurisdiction</span>
              <span>
                {closest.record.jurisdiction} ({closest.record.jurisdictionType})
              </span>
            </div>
            <div className="site-fact">
              <span>Status</span>
              <span style={{ color: closestMeta.color }} className="mono">
                {closestMeta.label}
              </span>
            </div>
            <div className="site-fact">
              <span>Distance to jurisdiction centroid</span>
              <span>{closest.centroidDistanceMiles.toFixed(1)} mi</span>
            </div>
            {closest.record.currentEndDateIso && (
              <div className="site-fact">
                <span>Current end</span>
                <span>{closest.record.currentEndDateIso}</span>
              </div>
            )}
            <div className="site-fact">
              <span>Evidence</span>
              <span>
                {closest.record.hasVerifyTags
                  ? `Source record contains verification flags (${closest.record.verifyCount} unresolved)`
                  : 'No outstanding verification tags'}
              </span>
            </div>
          </>
        )}
      </div>

      {nearby.triggerCategories.length > 0 && (
        <>
          <div className="panel__subheading panel__subheading--minor">
            Reasons driving nearby moratoria
          </div>
          <div className="reg-triggers">
            {nearby.triggerCategories.slice(0, 6).map(({ category, count }) => (
              <span key={category} className="reg-trigger">
                {triggerCategoryLabel(category)}
                <span className="reg-trigger__count">{count}</span>
              </span>
            ))}
          </div>
        </>
      )}

      <p className="sim-note">
        {REGULATORY_DATASET.centroidCaveat} Record coordinates are
        jurisdiction centroids, not moratorium boundaries.
      </p>
      <p className="sim-note">
        {REGULATORY_DATASET.caveat} {REGULATORY_DATASET.attribution}.
      </p>
    </div>
  )
}
