import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useEvent } from '../context/EventContext.js';
import { InspirationUpload } from '../components/plan/InspirationUpload.js';
import { SplurgeSaveSlider } from '../components/plan/SplurgeSaveSlider.js';
import { BomTable, type BomItemDisplay } from '../components/plan/BomTable.js';
import { BudgetAllocationCard } from '../components/plan/BudgetAllocationCard.js';
import { ChecklistSection } from '../components/plan/ChecklistSection.js';
import { PersonalizedIdeasSection } from '../components/plan/PersonalizedIdeasSection.js';

export const PlanView: React.FC = () => {
  const { currentEvent } = useEvent();
  const [bomItems, setBomItems] = useState<BomItemDisplay[]>([]);
  const [sliderTier, setSliderTier] = useState<number>(1); // 0=save, 1=standard, 2=splurge
  const [isLoadingBom, setIsLoadingBom] = useState(true);

  const loadBom = async () => {
    try {
      setIsLoadingBom(true);
      const res = await api.bom.get(currentEvent.id, currentEvent.token);
      setBomItems(res.items || []);
    } catch {
      // Fallback sample BOM items
      setBomItems([
        {
          id: 'bom-1',
          category: 'decor',
          item: 'Floating Lake Mandap with Floral Canopy',
          quantity: 1,
          unit: 'setup',
          selectedTier: 'standard',
          tiers: {
            save: {
              unitPriceMinor: 80000000,
              totalMinor: 80000000,
              description: 'Fabric draping with seasonal yellow and orange marigolds',
            },
            standard: {
              unitPriceMinor: 100000000,
              totalMinor: 100000000,
              description: 'Wooden carved pillars with fresh desi roses and brass lamps',
            },
            splurge: {
              unitPriceMinor: 130000000,
              totalMinor: 130000000,
              description: 'Glass-floor acrylic floating mandap with Dutch imported orchids',
            },
          },
        },
        {
          id: 'bom-2',
          category: 'decor',
          item: 'Palace Courtyard Fairy Light Tunnels',
          quantity: 12,
          unit: 'arches',
          selectedTier: 'standard',
          tiers: {
            save: {
              unitPriceMinor: 2400000,
              totalMinor: 28800000,
              description: 'Warm LED string fairy lights with bamboo frames',
            },
            standard: {
              unitPriceMinor: 3000000,
              totalMinor: 36000000,
              description: 'Micro-LED light curtain with brass hanging birdcages',
            },
            splurge: {
              unitPriceMinor: 3900000,
              totalMinor: 46800000,
              description: 'Crystal prism chandeliers with programmable smart DMX lighting',
            },
          },
        },
        {
          id: 'bom-3',
          category: 'decor',
          item: 'Rajasthani Royal Low Diwan Lounge Seating',
          quantity: 25,
          unit: 'sets',
          selectedTier: 'standard',
          tiers: {
            save: {
              unitPriceMinor: 1200000,
              totalMinor: 30000000,
              description: 'Cotton printed mattress with standard bolster pillows',
            },
            standard: {
              unitPriceMinor: 1500000,
              totalMinor: 37500000,
              description: 'Velvet upholstered diwans with gota-patti embroidered cushions',
            },
            splurge: {
              unitPriceMinor: 1950000,
              totalMinor: 48750000,
              description: 'Teakwood antique jhula swing lounges with silk brocade bolsters',
            },
          },
        },
      ]);
    } finally {
      setIsLoadingBom(false);
    }
  };

  useEffect(() => {
    void loadBom();
  }, [currentEvent.id]);

  // Handle global slider change -> recomputes tier for all items instantly
  const handleSliderChange = (tierVal: number) => {
    setSliderTier(tierVal);
    const tierKey: 'save' | 'standard' | 'splurge' =
      tierVal === 0 ? 'save' : tierVal === 1 ? 'standard' : 'splurge';

    setBomItems((prev) =>
      prev.map((item) => ({
        ...item,
        selectedTier: tierKey,
      })),
    );
  };

  // Handle per-item tier change
  const handleItemTierChange = async (itemId: string, tier: 'save' | 'standard' | 'splurge') => {
    setBomItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, selectedTier: tier } : item)),
    );

    try {
      await api.bom.updateTier(currentEvent.id, itemId, tier, currentEvent.token);
    } catch {
      // Local state already updated
    }
  };

  // Deterministic local computation of total BOM minor
  const computedBomTotalMinor = bomItems.reduce((sum, item) => {
    const tierData = item.tiers[item.selectedTier];
    return sum + (tierData?.totalMinor ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Stage 1: Plan &amp; Concept Architecture
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Turn vision photos into a catalog-priced Bill of Materials, dial in splurge/save budgets,
          and explore personalized recommendations.
        </p>
      </div>

      {/* Moodboard & Vision Upload */}
      <InspirationUpload onBomUpdated={loadBom} />

      {/* Splurge/Save Slider */}
      <SplurgeSaveSlider
        currentTierValue={sliderTier}
        onTierChange={handleSliderChange}
        computedTotalMinor={computedBomTotalMinor}
      />

      {/* Bill of Materials Table */}
      <BomTable items={bomItems} onTierChange={handleItemTierChange} isLoading={isLoadingBom} />

      {/* Budget Allocation & Lock Controls */}
      <BudgetAllocationCard />

      {/* Vendor & Milestone Checklist */}
      <ChecklistSection />

      {/* Personalized AI Ideas */}
      <PersonalizedIdeasSection />
    </div>
  );
};
