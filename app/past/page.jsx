"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { format, addDays, subDays, isToday, isFuture, startOfDay } from "date-fns";
import { th } from "date-fns/locale";
import Swal from 'sweetalert2';
import { 
  ChevronLeft, ChevronRight, CheckCircle2, 
  Trash2, Delete, Plus, ArrowLeft, 
  History, FileClock
} from "lucide-react";

export default function PastDeliveryTrackerApp() {
  const supabase = createClient();
  
  // ================= STATE (Cleaned for JSX) =================
  const [currentDate, setCurrentDate] = useState(subDays(new Date(), 1));
  const [isSettingUp, setIsSettingUp] = useState(true);
  const [totalItemsCount, setTotalItemsCount] = useState("");
  const [itemRates, setItemRates] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customRate, setCustomRate] = useState("");
  const [presetRates, setPresetRates] = useState([7, 6.75, 6.5]);
  const [dayTotal, setDayTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const activeItemRef = useRef(null);

  // ================= EFFECTS =================
  useEffect(() => { fetchRates(); }, []);

  useEffect(() => {
    fetchDeliveriesForDate(currentDate);
  }, [currentDate]);

  useEffect(() => {
    if (activeItemRef.current && !isSettingUp) {
      activeItemRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex, isSettingUp]);

  // ================= FETCH DATA =================
  const fetchRates = async () => {
    const { data } = await supabase.from("custom_rates").select("rate").order("use_count", { ascending: false }).limit(6);
    if (data && data.length > 0) setPresetRates(data.map(d => d.rate));
  };

  const fetchDeliveriesForDate = async (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const { data } = await supabase.from("deliveries").select("total_amount").eq("delivery_date", dateStr);
    if (data) setDayTotal(data.reduce((sum, item) => sum + Number(item.total_amount), 0));
  };

  // ================= HANDLERS =================
  const handlePrevDay = () => setCurrentDate(prev => subDays(prev, 1));
  
  const handleNextDay = () => {
    const nextDay = addDays(currentDate, 1);
    if (!isFuture(startOfDay(nextDay))) {
      setCurrentDate(nextDay);
    }
  };

  const startTracking = () => {
    const count = Number(totalItemsCount);
    if (count > 0 && count <= 500) {
      setItemRates(new Array(count).fill(""));
      setActiveIndex(0);
      setIsSettingUp(false);
    }
  };

  const handleRateSelect = async (rate) => {
    if (itemRates.length === 0) return;
    const newRates = [...itemRates];
    newRates[activeIndex] = rate.toString();
    setItemRates(newRates);

    if (isCustomMode && Number(rate) > 0) {
      if (!presetRates.includes(Number(rate))) {
        await supabase.from("custom_rates").upsert({ rate: Number(rate) }, { onConflict: 'rate' });
        fetchRates();
      }
      setIsCustomMode(false);
      setCustomRate("");
    }
    if (activeIndex < itemRates.length - 1) setActiveIndex(activeIndex + 1);
  };

  const handleUndo = () => {
    if (activeIndex > 0) {
      const newIndex = activeIndex - 1;
      const newRates = [...itemRates];
      newRates[newIndex] = ""; 
      setItemRates(newRates);
      setActiveIndex(newIndex); 
    } else if (activeIndex === 0) {
      const newRates = [...itemRates];
      newRates[0] = "";
      setItemRates(newRates);
    }
  };

  const handleReset = () => {
    setTotalItemsCount("");
    setItemRates([]);
    setIsSettingUp(true);
  };

  const confirmSubmit = () => {
    if (filledCount < Number(totalItemsCount)) {
      Swal.fire({ icon: 'warning', title: 'กรอกไม่ครบ!', text: `กรอกข้อมูลไปแค่ ${filledCount} จาก ${totalItemsCount} ชิ้น` });
      return;
    }
    Swal.fire({
      title: 'บันทึกย้อนหลัง?',
      html: `ลงยอดของวันที่: <b class="text-amber-600">${format(currentDate, "d MMM yyyy", { locale: th })}</b><br/><br/>จำนวนพัสดุ: <b>${totalItemsCount} ชิ้น</b><br/>ยอดรวมบิลนี้: <b>฿${currentTotalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})}</b>`,
      icon: 'warning', 
      showCancelButton: true, 
      confirmButtonColor: '#d97706', 
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'บันทึกข้อมูลย้อนหลัง!', 
      cancelButtonText: 'ยกเลิก', 
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) handleSubmit();
    });
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const dateStr = format(currentDate, "yyyy-MM-dd");
      const insertPayload = itemRates.map((rate, index) => {
        if (rate !== "" && Number(rate) > 0) {
          return {
            delivery_date: dateStr,
            quantity: 1,
            rate_per_piece: Number(rate),
            item_index: index + 1 
          };
        }
        return null;
      }).filter(Boolean);

      await supabase.from("deliveries").insert(insertPayload);
      Swal.fire({ icon: 'success', title: 'บันทึกยอดสำเร็จ!', showConfirmButton: false, timer: 1500 });
      handleReset();
      await fetchDeliveriesForDate(currentDate);
    } catch (error) {
      console.error(error);
      Swal.fire('ผิดพลาด', 'บันทึกข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ================= CALCULATIONS =================
  const filledCount = itemRates.filter(r => r !== "").length;
  const currentTotalAmount = itemRates.reduce((sum, val) => sum + (Number(val) || 0), 0);
  const progressPercent = itemRates.length > 0 ? (filledCount / itemRates.length) * 100 : 0;
  
  const canGoNextDay = !isToday(currentDate);

  return (
    <div className="min-h-screen bg-amber-50/30 text-slate-800 font-sans flex flex-col">
      
      <header className="sticky top-0 z-30 bg-white shadow-sm border-b border-amber-200 shrink-0">
        <div className="max-w-md mx-auto">
          <div className="bg-amber-100/50 text-amber-700 text-[10px] font-bold text-center py-1 uppercase tracking-widest flex items-center justify-center gap-1">
            <FileClock className="w-3 h-3" /> โหมดกรอกข้อมูลย้อนหลัง (Backfill)
          </div>
          <div className="flex items-center justify-between p-4">
            <button onClick={handlePrevDay} className="p-2 rounded-full hover:bg-amber-100 text-amber-600 transition-colors">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="text-center">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">{format(currentDate, "d MMMM yyyy", { locale: th })}</h2>
              <p className="text-xs text-amber-600 font-bold mt-0.5">ยอดของวันนี้: ฿{dayTotal.toLocaleString()}</p>
            </div>
            <button 
              onClick={handleNextDay} 
              disabled={!canGoNextDay}
              className={`p-2 rounded-full transition-colors ${canGoNextDay ? 'hover:bg-amber-100 text-amber-600' : 'text-slate-200 cursor-not-allowed'}`}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
          {!isSettingUp && (
            <div className="bg-amber-100 h-1.5 w-full">
              <div className="bg-amber-500 h-1.5 transition-all duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>
          )}
        </div>
      </header>

      <main className="max-w-md w-full mx-auto flex-1 flex flex-col relative pb-24">
        {isSettingUp ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95">
            <div className="bg-white p-8 rounded-3xl shadow-xl shadow-amber-200/40 border border-amber-100 w-full text-center">
              <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <History className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800 mb-2">ลงยอดกระดาษ</h1>
              <p className="text-slate-500 text-sm mb-8">ใส่จำนวนชิ้นพัสดุทั้งหมดของ <b>{format(currentDate, "d MMM yy", { locale: th })}</b></p>
              
              <input type="number" inputMode="numeric" autoFocus value={totalItemsCount} onChange={(e) => setTotalItemsCount(e.target.value)} placeholder="0" className="w-full text-center text-6xl font-black text-amber-500 bg-transparent outline-none border-b-2 border-amber-200 pb-4 mb-8 focus:border-amber-500 placeholder:text-slate-200" />
              
              <button onClick={startTracking} disabled={!totalItemsCount || Number(totalItemsCount) <= 0} className="w-full bg-slate-800 disabled:bg-slate-200 text-white py-4 rounded-2xl font-bold text-lg active:scale-95 transition-all shadow-md">เริ่มคีย์ราคา</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col pb-[280px]">
            <div className="bg-amber-50/50 p-4 sticky top-0 z-20 border-b border-amber-200 flex justify-between items-end backdrop-blur-sm">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">ทำรายการย้อนหลัง</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-black text-slate-800">{filledCount}</span>
                  <span className="text-slate-500 font-medium">/ {totalItemsCount}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase">ยอดรวมบิลนี้</p>
                <p className="text-2xl font-black text-amber-600 mt-1">฿{currentTotalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})}</p>
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {itemRates.map((rate, index) => {
                  const isActive = activeIndex === index;
                  const hasValue = rate !== "";
                  return (
                    <div key={index} ref={isActive ? activeItemRef : null} onClick={() => setActiveIndex(index)} className={`flex items-center justify-between p-3 rounded-xl transition-all border-b-2 ${isActive ? "bg-amber-100/50 border-amber-500 shadow-sm scale-[1.02]" : hasValue ? "bg-white border-transparent text-slate-700" : "bg-transparent border-amber-200/50 text-slate-300"}`}>
                      <span className={`font-mono text-sm ${isActive ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>{String(index + 1).padStart(2, '0')}.</span>
                      <span className={`font-bold text-lg ${isActive && !hasValue ? 'animate-pulse text-amber-400' : ''}`}>{hasValue ? rate : (isActive ? "_" : "-")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {!isSettingUp && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-100 border-t border-slate-200 p-4 pb-safe shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.1)] z-40">
          <div className="max-w-md mx-auto">
            <div className="flex gap-2 mb-3">
              <button onClick={handleUndo} className="flex-1 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 shadow-sm"><Delete className="w-5 h-5" /> <span className="text-sm">ลบถอยหลัง</span></button>
              <button onClick={handleReset} className="px-4 bg-red-50 text-red-600 py-3 rounded-xl font-bold flex items-center justify-center active:scale-95"><Trash2 className="w-5 h-5" /></button>
            </div>
            {!isCustomMode ? (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {presetRates.slice(0, 7).map((rate) => (
                  <button key={rate} onClick={() => handleRateSelect(rate)} className="bg-white border border-slate-200 hover:border-amber-300 text-slate-800 py-4 rounded-xl font-black text-xl shadow-sm active:bg-amber-100 active:text-amber-700 active:scale-95">{rate}</button>
                ))}
                <button onClick={() => setIsCustomMode(true)} className="bg-slate-800 text-white py-4 rounded-xl font-bold shadow-sm active:scale-95 flex items-center justify-center"><Plus className="w-6 h-6" /></button>
              </div>
            ) : (
              <div className="flex gap-2 mb-3">
                <button onClick={() => setIsCustomMode(false)} className="px-4 bg-slate-300 text-slate-700 font-bold rounded-xl active:scale-95"><ArrowLeft className="w-5 h-5" /></button>
                <input type="number" inputMode="decimal" autoFocus value={customRate} onChange={(e) => setCustomRate(e.target.value)} placeholder="ราคา..." className="flex-1 bg-white px-4 py-4 rounded-xl font-black text-xl outline-none focus:ring-2 focus:ring-amber-500 shadow-sm text-center" />
                <button onClick={() => handleRateSelect(customRate)} className="px-6 bg-amber-600 text-white font-bold text-lg rounded-xl active:scale-95 shadow-sm">ตกลง</button>
              </div>
            )}
            
            <button onClick={confirmSubmit} disabled={filledCount < Number(totalItemsCount) || isLoading} className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 ${filledCount === Number(totalItemsCount) ? 'bg-amber-500 text-white shadow-amber-200 hover:bg-amber-600' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
              {isLoading ? "กำลังบันทึก..." : <><CheckCircle2 className="w-6 h-6" /> {filledCount === Number(totalItemsCount) ? 'บันทึกย้อนหลังเลย!' : `ยังกรอกไม่ครบ (${filledCount}/${totalItemsCount})`}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}