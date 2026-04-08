"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTodayLocal } from "../lib/date";

export function useSyncedDashboardDate() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeDate = searchParams.get("date") ?? getTodayLocal();
  const [selectedDate, setSelectedDateState] = useState(routeDate);

  useEffect(() => {
    setSelectedDateState((current) => (current === routeDate ? current : routeDate));
  }, [routeDate]);

  useEffect(() => {
    if (selectedDate === routeDate) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", selectedDate);
    router.replace(`${pathname}?${params.toString()}` as never, { scroll: false });
  }, [pathname, routeDate, router, searchParams, selectedDate]);

  function setSelectedDate(nextValue: string | ((current: string) => string)) {
    setSelectedDateState((current) => {
      const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
      return next === current ? current : next;
    });
  }

  return [selectedDate, setSelectedDate] as const;
}
