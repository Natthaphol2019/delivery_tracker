"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import Swal from 'sweetalert2';
import { 
  CheckCircle2, Trash2, Delete, Plus, ArrowLeft, 
  ClipboardEdit, PieChart, Package, Coins, 
  History, Search, Clock, CalendarDays, Filter, Sparkles
} from "lucide-react";

// ================= TYPES: Navigation state persisted into browser history =================
type NavState = {
  __app: true;
  tab: 'tracker' | 'summary' | 'history';
  isSettingUp: boolean;
  selectedDateDetail: string | null;
};

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

  // ================= REFS: mirror latest state for use inside the popstate handler =================
  const activeTabRef = useRef(activeTab);
  const isSettingUpRef = useRef(isSettingUp);
  const selectedDateDetailRef = useRef(selectedDateDetail);
  const itemRatesRef = useRef(itemRates);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { isSettingUpRef.current = isSettingUp; }, [isSettingUp]);
  useEffect(() => { selectedDateDetailRef.current = selectedDateDetail; }, [selectedDateDetail]);
  useEffect(() => { itemRatesRef.current = itemRates; }, [itemRates]);

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

  // ================= NAVIGATION / BACK BUTTON (connects to the phone's hardware/gesture back) =================
  const buildState = (overrides: Partial<Omit<NavState, '__app'>> = {}): NavState => ({
    __app: true,
    tab: activeTabRef.current,
    isSettingUp: isSettingUpRef.current,
    selectedDateDetail: selectedDateDetailRef.current,
    ...overrides,
  });

  // เดินหน้า: เปลี่ยนหน้าจอ + ผลักสถานะเข้า browser history เพื่อให้ปุ่มย้อนกลับของมือถือใช้งานได้
  const goTo = (overrides: Partial<Omit<NavState, '__app'>>) => {
    if (overrides.tab !== undefined) setActiveTab(overrides.tab);
    if (overrides.isSettingUp !== undefined) setIsSettingUp(overrides.isSettingUp);
    if ('selectedDateDetail' in overrides) setSelectedDateDetail(overrides.selectedDateDetail ?? null);
    window.history.pushState(buildState(overrides), '');
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!window.history.state || !(window.history.state as any).__app) {
      window.history.replaceState(buildState(), '');
    }

    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as NavState | null;
      if (!state || !state.__app) return; // ไม่มี state ของแอปแล้ว ปล่อยให้เบราว์เซอร์จัดการ (ออกจากแอป)

      // ถ้ากำลังกรอกยอดอยู่และมีข้อมูลค้าง แล้วปุ่มย้อนกลับถูกกด -> ถามยืนยันก่อนทิ้งข้อมูล
      const leavingEntryWithProgress =
        activeTabRef.current === 'tracker' &&
        !isSettingUpRef.current &&
        state.isSettingUp === true &&
        itemRatesRef.current.some((r) => r !== "");

      if (leavingEntryWithProgress) {
        Swal.fire({
          title: 'ยกเลิกการกรอกยอด?',
          text: 'ข้อมูลที่กรอกไว้จะหายไปทั้งหมด',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444',
          cancelButtonColor: '#64748b',
          confirmButtonText: 'ใช่ ยกเลิกเลย',
          cancelButtonText: 'กรอกต่อ',
          reverseButtons: true,
        }).then((result) => {
          if (result.isConfirmed) {
            setItemRates([]);
            setTotalItemsCount("");
            setIsSettingUp(true);
          } else {
            // ผู้ใช้ไม่ยืนยัน -> ดันสถานะกลับไปที่หน้ากรอกยอดเหมือนเดิม
            window.history.pushState(buildState({ isSettingUp: false }), '');
          }
        });
        return;
      }

      setActiveTab(state.tab);
      setIsSettingUp(state.isSettingUp);
      setSelectedDateDetail(state.selectedDateDetail);
      if (state.selectedDateDetail) {
        fetchDayDetail(state.selectedDateDetail);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ดึงรายละเอียดของวันที่เลือก (ไม่ยุ่งกับ history — ใช้ทั้งตอนกดเข้าดูปกติ และตอน popstate คืนสถานะ)
  const fetchDayDetail = async (dateStr: string) => {
    setIsLoading(true);
    const { data } = await supabase.from("deliveries").select("*").eq("delivery_date", dateStr).order("item_index", { ascending: true });
    if (data) setDayDetailItems(data);
    setIsLoading(false);
  };

  // เปิดหน้ารายละเอียดของวัน + ผลักเข้า history เพื่อให้กดย้อนกลับได้
  const openDayDetail = (dateStr: string) => {
    goTo({ selectedDateDetail: dateStr });
    fetchDayDetail(dateStr);
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
      goTo({ isSettingUp: false });
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

  // ล้างข้อมูลแบบเงียบ (ใช้หลังบันทึกสำเร็จ) — ไม่ยุ่งกับ history เพราะอยู่ในหน้าเดิมอยู่แล้ว
  const handleReset = () => {
    setTotalItemsCount("");
    setItemRates([]);
    setIsSettingUp(true);
    if (typeof window !== 'undefined') {
      window.history.replaceState({ __app: true, tab: 'tracker', isSettingUp: true, selectedDateDetail: null } as NavState, '');
    }
  };

  // ยกเลิกการกรอกยอด (ปุ่มถังขยะ) — ถามยืนยันถ้ามีข้อมูลค้าง แล้วค่อยย้อนกลับผ่าน history.back()
  const handleCancelEntry = () => {
    const hasProgress = itemRates.some((r) => r !== "");
    const doCancel = () => {
      setItemRates([]);
      setTotalItemsCount("");
      itemRatesRef.current = [];
      window.history.back();
    };
    if (hasProgress) {
      Swal.fire({
        title: 'ล้างข้อมูลทั้งหมด?',
        text: 'ต้องการเริ่มรอบบิลใหม่และล้างข้อมูลที่กรอกไว้หรือไม่',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#ef4444', cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ล้างข้อมูล', cancelButtonText: 'ยกเลิก', reverseButtons: true,
      }).then((result) => { if (result.isConfirmed) doCancel(); });
    } else {
      doCancel();
    }
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
        fetchDayDetail(item.delivery_date); 
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
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-slate-50 to-slate-100 text-slate-800 font-sans flex flex-col relative overflow-x-hidden">

      {/* decorative ambient glow blobs */}
      <div className="pointer-events-none fixed -top-24 -right-24 w-72 h-72 bg-indigo-300/30 rounded-full blur-3xl z-0" />
      <div className="pointer-events-none fixed top-1/3 -left-24 w-72 h-72 bg-emerald-200/30 rounded-full blur-3xl z-0" />
      
      {/* ===================== TAB 1: TRACKER (LOCKED DATE) ===================== */}
      {activeTab === 'tracker' && (
        <div className="flex-1 flex flex-col relative z-10">
          <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl shadow-sm border-b border-slate-200/70 shrink-0">
            <div className="max-w-md mx-auto">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  {!isSettingUp && (
                    <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-full text-slate-500 hover:bg-slate-100 active:scale-90 transition-all">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-300/50">
                      <CalendarDays className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-black text-sm tracking-widest uppercase bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">ลงยอดวันนี้</span>
                  </div>
                </div>
                <div className="text-right">
                  <h2 className="text-sm font-black text-slate-800">{format(currentDate, "d MMMM yyyy", { locale: th })}</h2>
                  <p className="text-xs text-emerald-600 font-bold mt-0.5">ยอดบิลวันนี้: ฿{todayTotal.toLocaleString()}</p>
                </div>
              </div>
              {!isSettingUp && (
                <div className="bg-slate-100 h-1.5 w-full overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 h-1.5 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(99,102,241,0.6)]" style={{ width: `${progressPercent}%` }} />
                </div>
              )}
            </div>
          </header>

          <main className="max-w-md w-full mx-auto flex-1 flex flex-col relative pb-24">
            {isSettingUp ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
                <div className="relative bg-white p-8 rounded-3xl shadow-2xl shadow-indigo-200/60 border border-slate-100 w-full text-center overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full blur-2xl" />
                  <div className="relative w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-300/60 rotate-3">
                    <ClipboardEdit className="w-8 h-8" />
                  </div>
                  <h1 className="text-2xl font-black text-slate-800 mb-2">เริ่มรอบบิลใหม่</h1>
                  <p className="text-slate-500 text-sm mb-8">ใส่จำนวนชิ้นพัสดุทั้งหมดของวันนี้</p>
                  <input type="number" inputMode="numeric" autoFocus value={totalItemsCount} onChange={(e) => setTotalItemsCount(e.target.value)} placeholder="0" className="relative w-full text-center text-6xl font-black bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent outline-none border-b-2 border-slate-200 pb-4 mb-8 focus:border-indigo-500 placeholder:text-slate-200 transition-colors" />
                  <button onClick={startTracking} disabled={!totalItemsCount || Number(totalItemsCount) <= 0} className="relative w-full bg-gradient-to-r from-slate-900 to-slate-700 disabled:from-slate-200 disabled:to-slate-200 text-white py-4 rounded-2xl font-bold text-lg active:scale-95 transition-all shadow-lg shadow-slate-300/50 disabled:shadow-none flex items-center justify-center gap-2">
                    <Sparkles className="w-5 h-5" /> เริ่มคีย์ราคา
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col pb-[280px] animate-in fade-in duration-300">
                <div className="bg-white/70 backdrop-blur-md p-4 sticky top-0 z-20 border-b border-slate-200 flex justify-between items-end">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">ทำรายการ</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-3xl font-black text-slate-800">{filledCount}</span>
                      <span className="text-slate-500 font-medium">/ {totalItemsCount}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">ยอดรวมบิลนี้</p>
                    <p className="text-2xl font-black bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent mt-1">฿{currentTotalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})}</p>
                  </div>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {itemRates.map((rate, index) => {
                      const isActive = activeIndex === index;
                      const hasValue = rate !== "";
                      return (
                        <div key={index} ref={isActive ? activeItemRef : null} onClick={() => setActiveIndex(index)} className={`flex items-center justify-between p-3 rounded-2xl transition-all duration-200 border-b-2 ${isActive ? "bg-gradient-to-r from-indigo-50 to-violet-50 border-indigo-500 shadow-md shadow-indigo-100 scale-[1.03]" : hasValue ? "bg-white border-transparent text-slate-700 shadow-sm" : "bg-transparent border-slate-200/50 text-slate-300"}`}>
                          <span className={`font-mono text-sm ${isActive ? 'text-indigo-500 font-bold' : 'text-slate-400'}`}>{String(index + 1).padStart(2, '0')}.</span>
                          <span className={`font-bold text-lg ${isActive && !hasValue ? 'animate-pulse text-indigo-300' : ''} ${hasValue && !isActive ? 'text-emerald-600' : ''}`}>{hasValue ? rate : (isActive ? "_" : "-")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </main>

          {!isSettingUp && (
            <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-4 pb-safe shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.15)] z-40">
              <div className="max-w-md mx-auto">
                <div className="flex gap-2 mb-3">
                  <button onClick={handleUndo} className="flex-1 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 shadow-sm hover:border-indigo-200 transition-all"><Delete className="w-5 h-5" /> <span className="text-sm">ลบถอยหลัง</span></button>
                  <button onClick={handleCancelEntry} className="px-4 bg-gradient-to-br from-red-50 to-rose-50 text-red-600 py-3 rounded-xl font-bold flex items-center justify-center active:scale-95 border border-red-100"><Trash2 className="w-5 h-5" /></button>
                </div>
                {!isCustomMode ? (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {presetRates.slice(0, 7).map((rate) => (
                      <button key={rate} onClick={() => handleRateSelect(rate)} className="bg-white border border-slate-200 hover:border-indigo-300 text-slate-800 py-4 rounded-xl font-black text-xl shadow-sm active:bg-gradient-to-br active:from-indigo-50 active:to-violet-50 active:text-indigo-600 active:scale-95 transition-all">{rate}</button>
                    ))}
                    <button onClick={() => setIsCustomMode(true)} className="bg-gradient-to-br from-slate-800 to-slate-900 text-white py-4 rounded-xl font-bold shadow-md active:scale-95 flex items-center justify-center transition-all"><Plus className="w-6 h-6" /></button>
                  </div>
                ) : (
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => setIsCustomMode(false)} className="px-4 bg-slate-300 text-slate-700 font-bold rounded-xl active:scale-95"><ArrowLeft className="w-5 h-5" /></button>
                    <input type="number" inputMode="decimal" autoFocus value={customRate} onChange={(e) => setCustomRate(e.target.value)} placeholder="ราคา..." className="flex-1 bg-white px-4 py-4 rounded-xl font-black text-xl outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm text-center" />
                    <button onClick={() => handleRateSelect(customRate)} className="px-6 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-lg rounded-xl active:scale-95 shadow-md shadow-indigo-200">ตกลง</button>
                  </div>
                )}
                <button onClick={confirmSubmit} disabled={filledCount < Number(totalItemsCount) || isLoading} className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 ${filledCount === Number(totalItemsCount) ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-200 hover:from-emerald-600 hover:to-teal-600' : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'}`}>
                  {isLoading ? "กำลังบันทึก..." : <><CheckCircle2 className="w-6 h-6" /> {filledCount === Number(totalItemsCount) ? 'บันทึกบิลนี้เลย!' : `ยังกรอกไม่ครบ (${filledCount}/${totalItemsCount})`}</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 2: SUMMARY & FILTER ===================== */}
      {activeTab === 'summary' && (
        <div className="flex-1 flex flex-col bg-transparent pb-24 relative z-10">
          {!selectedDateDetail ? (
            <>
              <header className="bg-white/80 backdrop-blur-xl px-4 py-6 shadow-sm border-b border-slate-200/70">
                <div className="max-w-md mx-auto">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-black bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">สรุปยอดจัดส่ง</h1>
                      <p className="text-slate-500 text-sm mt-1">กดที่การ์ดเพื่อดูและแก้ไขรายชิ้น</p>
                    </div>
                  </div>
                  
                  {/* กล่อง Filter เลือกรอบบิล */}
                  <div className="mt-4 flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl shadow-sm">
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

                  <div className="mt-4 relative bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-6 text-white shadow-2xl shadow-indigo-300/40 overflow-hidden">
                    <div className="absolute -top-8 -right-8 w-40 h-40 bg-indigo-500/20 rounded-full blur-2xl" />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-violet-500/20 rounded-full blur-2xl" />
                    <div className="relative flex items-center gap-2 text-slate-300 mb-2 text-sm font-medium"><Coins className="w-4 h-4" /> ยอดรวมรอบที่เลือก</div>
                    <h2 className="relative text-4xl font-black mb-4 bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">฿{filteredSummary.reduce((sum, day) => sum + day.totalAmount, 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</h2>
                    <div className="relative flex items-center gap-2 bg-white/10 w-max px-3 py-1.5 rounded-full text-sm font-medium border border-white/10"><Package className="w-4 h-4 text-indigo-300" /> รวม {filteredSummary.reduce((sum, day) => sum + day.totalItems, 0).toLocaleString()} ชิ้น</div>
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
                          onClick={() => openDayDetail(day.date)}
                          className="group relative bg-white rounded-3xl p-5 shadow-sm border border-slate-200/60 cursor-pointer hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-100 transition-all active:scale-95 overflow-hidden"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-indigo-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="flex justify-between items-center mb-3">
                            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-600 px-3 py-1 rounded-full text-xs font-bold border border-indigo-100">
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
                              <p className="text-2xl font-black bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">฿{day.totalAmount.toLocaleString('th-TH')}</p>
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
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 duration-300">
              <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl shadow-sm border-b border-slate-200/70 shrink-0 p-4">
                <div className="max-w-md mx-auto flex items-center justify-between">
                  <button onClick={() => window.history.back()} className="p-2 bg-slate-100 rounded-full text-slate-600 active:scale-90 hover:bg-slate-200 transition-all">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="text-center">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">{format(new Date(selectedDateDetail), "dd MMM yyyy", { locale: th })}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">รวม {dayDetailItems.length} ชิ้น</p>
                  </div>
                  <div className="w-9"></div> 
                </div>
              </header>
              <main className="max-w-md w-full mx-auto flex-1 p-4 bg-white/60 backdrop-blur-sm">
                <p className="text-sm text-slate-500 mb-4 text-center">แตะที่แถวรายการที่ต้องการแก้ไขราคา</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {dayDetailItems.map((item) => (
                    <div key={item.id} onClick={() => handleEditItem(item)} className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-white cursor-pointer hover:bg-gradient-to-r hover:from-indigo-50 hover:to-violet-50 hover:border-indigo-200 hover:shadow-sm transition-all active:scale-95">
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
        <div className="flex-1 flex flex-col bg-transparent pb-24 relative z-10">
          <header className="bg-white/80 backdrop-blur-xl px-4 py-6 shadow-sm border-b border-slate-200/70">
            <div className="max-w-md mx-auto">
              <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-300/50">
                  <History className="w-5 h-5 text-white" />
                </div>
                ประวัติการแก้ไข
              </h1>
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
                  <div key={log.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/50 hover:shadow-md hover:border-indigo-100 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        {format(new Date(log.edited_at), "dd MMM yy, HH:mm", { locale: th })}
                      </div>
                      <div className="text-[10px] font-bold px-2 py-1 bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-600 rounded-md border border-indigo-100">
                        บิล {format(new Date(log.delivery_date), "dd/MM", { locale: th })}
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 mb-1">แก้ชิ้นที่: <span className="text-lg font-black text-indigo-600">#{log.item_index}</span></p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="line-through text-slate-400">{log.old_rate} บ.</span>
                      <ArrowLeft className="w-4 h-4 text-slate-300 rotate-180" />
                      <span className="font-bold bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">{log.new_rate} บ.</span>
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
        <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 pb-safe z-50 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">
          <div className="max-w-md mx-auto flex">
            <button onClick={() => goTo({ tab: 'tracker', selectedDateDetail: null })} className={`flex-1 flex flex-col items-center justify-center py-4 gap-1 transition-colors relative ${activeTab === 'tracker' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              {activeTab === 'tracker' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-b-full shadow-[0_2px_8px_rgba(99,102,241,0.5)]" />}
              <ClipboardEdit className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">บันทึกยอด</span>
            </button>
            <button onClick={() => goTo({ tab: 'summary' })} className={`flex-1 flex flex-col items-center justify-center py-4 gap-1 transition-colors relative ${activeTab === 'summary' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              {activeTab === 'summary' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-b-full shadow-[0_2px_8px_rgba(99,102,241,0.5)]" />}
              <PieChart className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">สรุปยอด</span>
            </button>
            <button onClick={() => goTo({ tab: 'history', selectedDateDetail: null })} className={`flex-1 flex flex-col items-center justify-center py-4 gap-1 transition-colors relative ${activeTab === 'history' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              {activeTab === 'history' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-b-full shadow-[0_2px_8px_rgba(99,102,241,0.5)]" />}
              <History className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">ประวัติ</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}