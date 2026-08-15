"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import Swal from 'sweetalert2';
import { 
  CheckCircle2, Trash2, Delete, Plus, ArrowLeft, 
  ClipboardEdit, PieChart, Package, Coins, 
  History, Search, Clock, CalendarDays, Filter
} from "lucide-react";

export default function DeliveryTrackerApp() {
  const supabase = createClient();
  
  // ================= STATE: Navigation =================
  const [activeTab, setActiveTab] = useState<'tracker' | 'summary' | 'history'>('tracker');
  
  // ================= STATE: Tracker (Locked to Today) =================
  const [currentDate] = useState(new Date()); // ล็อกวันที่เป็น "วันนี้" เสมอ ไม่ให้มี SetState เปลี่ยนวัน
  const [isSettingUp, setIsSettingUp] = useState(true);
  const [totalItemsCount, setTotalItemsCount] = useState<string>("");
  const [itemRates, setItemRates] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customRate, setCustomRate] = useState<string>("");
  const [presetRates, setPresetRates] = useState<number[]>([7, 6.75, 6.5]);
  const [todayTotal, setTodayTotal] = useState<number>(0);
  
  // ================= STATE: Summary & Filter =================
  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [availableCycles, setAvailableCycles] = useState<string[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>("ALL"); // ค่าเริ่มต้นคือดูทั้งหมด
  const [selectedDateDetail, setSelectedDateDetail] = useState<string | null>(null);
  const [dayDetailItems, setDayDetailItems] = useState<any[]>([]);
  
  // ================= STATE: Edit Logs =================
  const [editLogs, setEditLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const activeItemRef = useRef<HTMLDivElement>(null);

  // ================= EFFECTS =================
  useEffect(() => { fetchRates(); }, []);

  useEffect(() => {
    if (activeTab === 'tracker') fetchDeliveriesForDate(currentDate);
    else if (activeTab === 'summary') loadSummaryData();
    else if (activeTab === 'history') loadEditLogs();
  }, [currentDate, activeTab]);

  useEffect(() => {
    if (activeItemRef.current && !isSettingUp && activeTab === 'tracker') {
      activeItemRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex, isSettingUp, activeTab]);

  // ================= HELPER: ตัดรอบบิล =================
  const getBillingCycle = (dateString: string) => {
    const d = new Date(dateString);
    const year = d.getFullYear() + 543; // ปี พ.ศ.
    const month = format(d, 'MMM', { locale: th });
    const day = d.getDate();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); // หาวันสิ้นเดือน
    
    if (day <= 15) {
      return `รอบ 1-15 ${month} ${year}`;
    } else {
      return `รอบ 16-${lastDay} ${month} ${year}`;
    }
  };

  // ================= FETCH DATA =================
  const fetchRates = async () => {
    const { data } = await supabase.from("custom_rates").select("rate").order("use_count", { ascending: false }).limit(6);
    if (data && data.length > 0) setPresetRates(data.map(d => d.rate));
  };

  const fetchDeliveriesForDate = async (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const { data } = await supabase.from("deliveries").select("total_amount").eq("delivery_date", dateStr);
    if (data) setTodayTotal(data.reduce((sum, item) => sum + Number(item.total_amount), 0));
  };

  const loadSummaryData = async () => {
    setIsLoading(true);
    const { data } = await supabase.from("deliveries").select("*").order("delivery_date", { ascending: false });
    if (data) {
      const grouped = data.reduce((acc, curr) => {
        const date = curr.delivery_date;
        const cycle = getBillingCycle(date);
        
        if (!acc[date]) acc[date] = { date, totalItems: 0, totalAmount: 0, cycle };
        acc[date].totalItems += curr.quantity;
        acc[date].totalAmount += Number(curr.total_amount);
        return acc;
      }, {});
      
      const summaryArray = Object.values(grouped) as any[];
      setSummaryData(summaryArray);

      // ดึงรอบบิลทั้งหมดที่มีเพื่อทำ Filter
      const cycles = Array.from(new Set(summaryArray.map(item => item.cycle)));
      setAvailableCycles(cycles as string[]);
    }
    setIsLoading(false);
  };

  const loadDayDetail = async (dateStr: string) => {
    setIsLoading(true);
    const { data } = await supabase.from("deliveries").select("*").eq("delivery_date", dateStr).order("item_index", { ascending: true });
    if (data) {
      setDayDetailItems(data);
      setSelectedDateDetail(dateStr);
    }
    setIsLoading(false);
  };

  const loadEditLogs = async () => {
    setIsLoading(true);
    const { data } = await supabase.from("delivery_edit_logs").select("*").order("edited_at", { ascending: false }).limit(50);
    if (data) setEditLogs(data);
    setIsLoading(false);
  };

  // ================= HANDLERS: Tracker =================
  const startTracking = () => {
    const count = Number(totalItemsCount);
    if (count > 0 && count <= 500) {
      setItemRates(new Array(count).fill(""));
      setActiveIndex(0);
      setIsSettingUp(false);
    }
  };

  const handleRateSelect = async (rate: number | string) => {
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
      title: 'ยืนยันการบันทึก?',
      html: `วันที่: <b>${format(currentDate, "d MMM yyyy", { locale: th })}</b><br/>จำนวนพัสดุ: <b>${totalItemsCount} ชิ้น</b><br/>ยอดรวมบิลนี้: <b>฿${currentTotalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})}</b>`,
      icon: 'question', showCancelButton: true, confirmButtonColor: '#10b981', cancelButtonColor: '#ef4444',
      confirmButtonText: 'ตกลง บันทึกเลย!', cancelButtonText: 'เช็คอีกที', reverseButtons: true
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

  const handleEditItem = async (item: any) => {
    const confirm1 = await Swal.fire({
      title: 'ต้องการแก้ไขยอดนี้?',
      html: `<b>ชิ้นที่ ${item.item_index}</b><br/>ราคาเดิม: ${item.rate_per_piece} บาท`,
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#3b82f6', cancelButtonColor: '#94a3b8',
      confirmButtonText: 'ใช่, ต้องการแก้ไข', cancelButtonText: 'ยกเลิก', reverseButtons: true
    });

    if (!confirm1.isConfirmed) return;

    const { value: newRate } = await Swal.fire({
      title: `กรอกราคาใหม่`, text: `สำหรับชิ้นที่ ${item.item_index}`, input: 'number',
      inputAttributes: { step: '0.01' }, inputValue: item.rate_per_piece,
      showCancelButton: true, confirmButtonColor: '#10b981', cancelButtonColor: '#ef4444',
      confirmButtonText: 'ยืนยันการแก้ไข!', cancelButtonText: 'ยกเลิก',
      inputValidator: (value) => { if (!value || Number(value) <= 0) return 'กรุณาระบุราคาที่ถูกต้อง!'; }
    });

    if (newRate && Number(newRate) !== Number(item.rate_per_piece)) {
      setIsLoading(true);
      try {
        await supabase.from('delivery_edit_logs').insert({
          delivery_date: item.delivery_date, item_index: item.item_index, old_rate: item.rate_per_piece, new_rate: Number(newRate)
        });
        await supabase.from('deliveries').update({ rate_per_piece: Number(newRate) }).eq('id', item.id);
        Swal.fire({ icon: 'success', title: 'อัปเดตราคาสำเร็จ!', showConfirmButton: false, timer: 1500 });
        loadDayDetail(item.delivery_date); 
      } catch (error) {
        console.error(error);
        Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล', 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // ================= CALCULATIONS & FILTER =================
  const filledCount = itemRates.filter(r => r !== "").length;
  const currentTotalAmount = itemRates.reduce((sum, val) => sum + (Number(val) || 0), 0);
  const progressPercent = itemRates.length > 0 ? (filledCount / itemRates.length) * 100 : 0;
  const hideBottomNav = activeTab === 'tracker' && !isSettingUp; 
  
  // Filter ข้อมูลตามรอบบิลที่เลือก
  const filteredSummary = selectedCycle === "ALL" 
    ? summaryData 
    : summaryData.filter(day => day.cycle === selectedCycle);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      
      {/* ===================== TAB 1: TRACKER (LOCKED DATE) ===================== */}
      {activeTab === 'tracker' && (
        <div className="flex-1 flex flex-col">
          <header className="sticky top-0 z-30 bg-white shadow-sm border-b border-slate-200 shrink-0">
            <div className="max-w-md mx-auto">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2 text-indigo-600">
                  <CalendarDays className="w-5 h-5" />
                  <span className="font-bold text-sm tracking-widest uppercase">ลงยอดวันนี้</span>
                </div>
                <div className="text-right">
                  <h2 className="text-sm font-black text-slate-800">{format(currentDate, "d MMMM yyyy", { locale: th })}</h2>
                  <p className="text-xs text-emerald-600 font-semibold mt-0.5">ยอดบิลวันนี้: ฿{todayTotal.toLocaleString()}</p>
                </div>
              </div>
              {!isSettingUp && (
                <div className="bg-slate-100 h-1.5 w-full">
                  <div className="bg-indigo-600 h-1.5 transition-all duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
                </div>
              )}
            </div>
          </header>

          <main className="max-w-md w-full mx-auto flex-1 flex flex-col relative pb-24">
            {isSettingUp ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95">
                <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 w-full text-center">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-6"><ClipboardEdit className="w-8 h-8" /></div>
                  <h1 className="text-2xl font-bold text-slate-800 mb-2">เริ่มรอบบิลใหม่</h1>
                  <p className="text-slate-500 text-sm mb-8">ใส่จำนวนชิ้นพัสดุทั้งหมดของวันนี้</p>
                  <input type="number" inputMode="numeric" autoFocus value={totalItemsCount} onChange={(e) => setTotalItemsCount(e.target.value)} placeholder="0" className="w-full text-center text-6xl font-black text-indigo-600 bg-transparent outline-none border-b-2 border-slate-200 pb-4 mb-8 focus:border-indigo-500 placeholder:text-slate-200" />
                  <button onClick={startTracking} disabled={!totalItemsCount || Number(totalItemsCount) <= 0} className="w-full bg-slate-900 disabled:bg-slate-200 text-white py-4 rounded-2xl font-bold text-lg active:scale-95 transition-all">เริ่มคีย์ราคา</button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col pb-[280px]">
                <div className="bg-slate-50 p-4 sticky top-0 z-20 border-b border-slate-200 flex justify-between items-end">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">ทำรายการ</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-3xl font-black text-slate-800">{filledCount}</span>
                      <span className="text-slate-500 font-medium">/ {totalItemsCount}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-400 uppercase">ยอดรวมบิลนี้</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1">฿{currentTotalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})}</p>
                  </div>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {itemRates.map((rate, index) => {
                      const isActive = activeIndex === index;
                      const hasValue = rate !== "";
                      return (
                        <div key={index} ref={isActive ? activeItemRef : null} onClick={() => setActiveIndex(index)} className={`flex items-center justify-between p-3 rounded-xl transition-all border-b-2 ${isActive ? "bg-indigo-50 border-indigo-500 shadow-sm scale-[1.02]" : hasValue ? "bg-white border-transparent text-slate-700" : "bg-transparent border-slate-200/50 text-slate-300"}`}>
                          <span className={`font-mono text-sm ${isActive ? 'text-indigo-500 font-bold' : 'text-slate-400'}`}>{String(index + 1).padStart(2, '0')}.</span>
                          <span className={`font-bold text-lg ${isActive && !hasValue ? 'animate-pulse text-indigo-300' : ''}`}>{hasValue ? rate : (isActive ? "_" : "-")}</span>
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
                      <button key={rate} onClick={() => handleRateSelect(rate)} className="bg-white border border-slate-200 hover:border-indigo-200 text-slate-800 py-4 rounded-xl font-black text-xl shadow-sm active:bg-indigo-50 active:text-indigo-600 active:scale-95">{rate}</button>
                    ))}
                    <button onClick={() => setIsCustomMode(true)} className="bg-slate-800 text-white py-4 rounded-xl font-bold shadow-sm active:scale-95 flex items-center justify-center"><Plus className="w-6 h-6" /></button>
                  </div>
                ) : (
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => setIsCustomMode(false)} className="px-4 bg-slate-300 text-slate-700 font-bold rounded-xl active:scale-95"><ArrowLeft className="w-5 h-5" /></button>
                    <input type="number" inputMode="decimal" autoFocus value={customRate} onChange={(e) => setCustomRate(e.target.value)} placeholder="ราคา..." className="flex-1 bg-white px-4 py-4 rounded-xl font-black text-xl outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm text-center" />
                    <button onClick={() => handleRateSelect(customRate)} className="px-6 bg-indigo-600 text-white font-bold text-lg rounded-xl active:scale-95 shadow-sm">ตกลง</button>
                  </div>
                )}
                <button onClick={confirmSubmit} disabled={filledCount < Number(totalItemsCount) || isLoading} className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 ${filledCount === Number(totalItemsCount) ? 'bg-emerald-500 text-white shadow-emerald-200 hover:bg-emerald-600' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
                  {isLoading ? "กำลังบันทึก..." : <><CheckCircle2 className="w-6 h-6" /> {filledCount === Number(totalItemsCount) ? 'บันทึกบิลนี้เลย!' : `ยังกรอกไม่ครบ (${filledCount}/${totalItemsCount})`}</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 2: SUMMARY & FILTER ===================== */}
      {activeTab === 'summary' && (
        <div className="flex-1 flex flex-col bg-slate-100 pb-24">
          {!selectedDateDetail ? (
            <>
              <header className="bg-white px-4 py-6 shadow-sm border-b border-slate-200">
                <div className="max-w-md mx-auto">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-black text-slate-800">สรุปยอดจัดส่ง</h1>
                      <p className="text-slate-500 text-sm mt-1">กดที่การ์ดเพื่อดูและแก้ไขรายชิ้น</p>
                    </div>
                  </div>
                  
                  {/* กล่อง Filter เลือกรอบบิล */}
                  <div className="mt-4 flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl">
                    <Filter className="w-5 h-5 text-indigo-500 ml-2" />
                    <select 
                      value={selectedCycle}
                      onChange={(e) => setSelectedCycle(e.target.value)}
                      className="w-full bg-transparent outline-none font-bold text-slate-700 py-1 cursor-pointer"
                    >
                      <option value="ALL">ดูทุกรอบบิล (ทั้งหมด)</option>
                      {availableCycles.map(cycle => (
                        <option key={cycle} value={cycle}>{cycle}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-slate-200">
                    <div className="flex items-center gap-2 text-slate-300 mb-2 text-sm font-medium"><Coins className="w-4 h-4" /> ยอดรวมรอบที่เลือก</div>
                    <h2 className="text-4xl font-black mb-4">฿{filteredSummary.reduce((sum, day) => sum + day.totalAmount, 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</h2>
                    <div className="flex items-center gap-2 bg-white/10 w-max px-3 py-1.5 rounded-full text-sm font-medium"><Package className="w-4 h-4 text-indigo-300" /> รวม {filteredSummary.reduce((sum, day) => sum + day.totalItems, 0).toLocaleString()} ชิ้น</div>
                  </div>
                </div>
              </header>
              <main className="max-w-md w-full mx-auto flex-1 p-4">
                {isLoading ? <p className="text-center text-slate-400 mt-10">กำลังโหลด...</p> : filteredSummary.length === 0 ? (
                   <div className="text-center text-slate-400 mt-10">
                     <p>ไม่พบข้อมูลในรอบบิลนี้</p>
                   </div>
                ) : (
                  <div className="space-y-4">
                    {filteredSummary.map((day: any) => {
                      const d = new Date(day.date);
                      return (
                        <div 
                          key={day.date} 
                          onClick={() => loadDayDetail(day.date)}
                          className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/60 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all active:scale-95"
                        >
                          <div className="flex justify-between items-center mb-3">
                            <div className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-xs font-bold">
                              {day.cycle}
                            </div>
                          </div>
                          
                          {/* แยก วัน/เดือน/ปี ชัดเจน */}
                          <div className="flex justify-between items-end mb-2">
                            <div className="flex items-baseline gap-1">
                              <span className="text-4xl font-black text-slate-800">{format(d, "dd")}</span>
                              <div className="flex flex-col leading-none">
                                <span className="text-sm font-bold text-slate-500">{format(d, "MMM", { locale: th })}</span>
                                <span className="text-xs text-slate-400">{format(d, "yyyy")}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-black text-emerald-600">฿{day.totalAmount.toLocaleString('th-TH')}</p>
                              <p className="text-sm font-bold text-slate-500 mt-0.5">{day.totalItems} ชิ้น</p>
                            </div>
                          </div>
                          <div className="flex items-center text-slate-400 text-xs font-semibold mt-4 border-t border-slate-100 pt-3 justify-center gap-1">
                            <Search className="w-3.5 h-3.5" /> แตะเพื่อแก้ไขรายชิ้น
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </main>
            </>
          ) : (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4">
              <header className="sticky top-0 z-30 bg-white shadow-sm border-b border-slate-200 shrink-0 p-4">
                <div className="max-w-md mx-auto flex items-center justify-between">
                  <button onClick={() => setSelectedDateDetail(null)} className="p-2 bg-slate-100 rounded-full text-slate-600 active:scale-95">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="text-center">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">{format(new Date(selectedDateDetail), "dd MMM yyyy", { locale: th })}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">รวม {dayDetailItems.length} ชิ้น</p>
                  </div>
                  <div className="w-9"></div> 
                </div>
              </header>
              <main className="max-w-md w-full mx-auto flex-1 p-4 bg-white">
                <p className="text-sm text-slate-500 mb-4 text-center">แตะที่แถวรายการที่ต้องการแก้ไขราคา</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {dayDetailItems.map((item) => (
                    <div key={item.id} onClick={() => handleEditItem(item)} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50 cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-all active:scale-95">
                      <span className="font-mono text-sm font-bold text-slate-500">{String(item.item_index).padStart(2, '0')}.</span>
                      <span className="font-bold text-lg text-slate-800">{item.rate_per_piece}</span>
                    </div>
                  ))}
                </div>
              </main>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 3: HISTORY ===================== */}
      {activeTab === 'history' && (
        <div className="flex-1 flex flex-col bg-slate-100 pb-24">
          <header className="bg-white px-4 py-6 shadow-sm border-b border-slate-200">
            <div className="max-w-md mx-auto">
              <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><History className="w-6 h-6 text-indigo-600" /> ประวัติการแก้ไข</h1>
              <p className="text-slate-500 text-sm mt-1">ตรวจสอบความเคลื่อนไหว (Audit Log)</p>
            </div>
          </header>
          <main className="max-w-md w-full mx-auto flex-1 p-4">
            {isLoading ? <p className="text-center text-slate-400 mt-10">กำลังโหลด...</p> : editLogs.length === 0 ? (
              <div className="text-center text-slate-400 mt-10">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>ยังไม่มีประวัติการแก้ไขข้อมูล</p>
              </div>
            ) : (
              <div className="space-y-3">
                {editLogs.map((log) => (
                  <div key={log.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        {format(new Date(log.edited_at), "dd MMM yy, HH:mm", { locale: th })}
                      </div>
                      <div className="text-[10px] font-bold px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md">
                        บิล {format(new Date(log.delivery_date), "dd/MM", { locale: th })}
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 mb-1">แก้ชิ้นที่: <span className="text-lg font-black text-indigo-600">#{log.item_index}</span></p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="line-through text-slate-400">{log.old_rate} บ.</span>
                      <ArrowLeft className="w-4 h-4 text-slate-300 rotate-180" />
                      <span className="font-bold text-emerald-600">{log.new_rate} บ.</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ===================== BOTTOM NAVIGATION ===================== */}
      {!hideBottomNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe z-50">
          <div className="max-w-md mx-auto flex">
            <button onClick={() => { setActiveTab('tracker'); setSelectedDateDetail(null); }} className={`flex-1 flex flex-col items-center justify-center py-4 gap-1 transition-colors relative ${activeTab === 'tracker' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              {activeTab === 'tracker' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-600 rounded-b-full" />}
              <ClipboardEdit className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">บันทึกยอด</span>
            </button>
            <button onClick={() => setActiveTab('summary')} className={`flex-1 flex flex-col items-center justify-center py-4 gap-1 transition-colors relative ${activeTab === 'summary' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              {activeTab === 'summary' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-600 rounded-b-full" />}
              <PieChart className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">สรุปยอด</span>
            </button>
            <button onClick={() => { setActiveTab('history'); setSelectedDateDetail(null); }} className={`flex-1 flex flex-col items-center justify-center py-4 gap-1 transition-colors relative ${activeTab === 'history' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              {activeTab === 'history' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-600 rounded-b-full" />}
              <History className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">ประวัติ</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}