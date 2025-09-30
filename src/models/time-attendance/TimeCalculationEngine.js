export class TimeCalculationEngine {
    constructor(overtimeRules = {}) {
        this.defaultOvertimeRules = {
            dailyOvertimeThreshold: 8,
            weeklyOvertimeThreshold: 40,
            overtimeMultiplier: 1.5,
            doubleTimeThreshold: 12,
            doubleTimeMultiplier: 2.0
        };
        this.overtimeRules = { ...this.defaultOvertimeRules, ...overtimeRules };
    }
    /**
     * Calculate total hours for a single time entry
     */
    calculateTimeEntryHours(timeEntry) {
        if (!timeEntry.clockOutTime) {
            return {
                regularHours: 0,
                overtimeHours: 0,
                doubleTimeHours: 0,
                totalHours: 0,
                totalBreakTime: 0,
                paidBreakTime: 0,
                unpaidBreakTime: 0
            };
        }
        const totalMinutes = (timeEntry.clockOutTime.getTime() - timeEntry.clockInTime.getTime()) / (1000 * 60);
        const totalBreakTime = timeEntry.getTotalBreakTime();
        const unpaidBreakTime = timeEntry.getUnpaidBreakTime();
        // Calculate worked hours (total time minus unpaid breaks)
        const workedMinutes = totalMinutes - unpaidBreakTime;
        const workedHours = Math.round((workedMinutes / 60) * 100) / 100;
        // Apply daily overtime rules
        const { regularHours, overtimeHours, doubleTimeHours } = this.calculateDailyOvertime(workedHours);
        return {
            regularHours,
            overtimeHours,
            doubleTimeHours,
            totalHours: workedHours,
            totalBreakTime,
            paidBreakTime: timeEntry.getPaidBreakTime(),
            unpaidBreakTime
        };
    }
    /**
     * Calculate daily overtime based on daily thresholds
     */
    calculateDailyOvertime(totalHours) {
        let regularHours = 0;
        let overtimeHours = 0;
        let doubleTimeHours = 0;
        if (totalHours <= this.overtimeRules.dailyOvertimeThreshold) {
            regularHours = totalHours;
        }
        else if (!this.overtimeRules.doubleTimeThreshold || totalHours <= this.overtimeRules.doubleTimeThreshold) {
            regularHours = this.overtimeRules.dailyOvertimeThreshold;
            overtimeHours = totalHours - this.overtimeRules.dailyOvertimeThreshold;
        }
        else {
            regularHours = this.overtimeRules.dailyOvertimeThreshold;
            overtimeHours = this.overtimeRules.doubleTimeThreshold - this.overtimeRules.dailyOvertimeThreshold;
            doubleTimeHours = totalHours - this.overtimeRules.doubleTimeThreshold;
        }
        return {
            regularHours: Math.round(regularHours * 100) / 100,
            overtimeHours: Math.round(overtimeHours * 100) / 100,
            doubleTimeHours: Math.round(doubleTimeHours * 100) / 100
        };
    }
    /**
     * Calculate daily totals for multiple time entries on the same day
     */
    calculateDailyHours(timeEntries, date) {
        // Filter entries for the specific date
        const dayEntries = timeEntries.filter(entry => this.isSameDay(entry.clockInTime, date));
        let totalHours = 0;
        let totalBreakTime = 0;
        // Calculate totals for all entries in the day
        for (const entry of dayEntries) {
            const calculation = this.calculateTimeEntryHours(entry);
            totalHours += calculation.totalHours;
            totalBreakTime += calculation.totalBreakTime;
        }
        // Apply daily overtime rules to the total hours for the day
        const { regularHours, overtimeHours, doubleTimeHours } = this.calculateDailyOvertime(totalHours);
        return {
            date,
            timeEntries: dayEntries,
            regularHours,
            overtimeHours,
            doubleTimeHours,
            totalHours,
            breakTime: totalBreakTime
        };
    }
    /**
     * Calculate weekly totals with weekly overtime rules
     */
    calculateWeeklyHours(timeEntries, weekStartDate) {
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekStartDate.getDate() + 6);
        // Filter entries for the week
        const weekEntries = timeEntries.filter(entry => entry.clockInTime >= weekStartDate && entry.clockInTime <= weekEndDate);
        // Calculate daily totals for each day of the week
        const dailyCalculations = [];
        let totalRegularHours = 0;
        let totalOvertimeHours = 0;
        let totalDoubleTimeHours = 0;
        let totalHours = 0;
        let totalBreakTime = 0;
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(weekStartDate);
            currentDate.setDate(weekStartDate.getDate() + i);
            const dailyCalc = this.calculateDailyHours(weekEntries, currentDate);
            dailyCalculations.push(dailyCalc);
            totalRegularHours += dailyCalc.regularHours;
            totalOvertimeHours += dailyCalc.overtimeHours;
            totalDoubleTimeHours += dailyCalc.doubleTimeHours;
            totalHours += dailyCalc.totalHours;
            totalBreakTime += dailyCalc.breakTime;
        }
        // Apply weekly overtime rules - convert regular hours to overtime if exceeding weekly threshold
        if (totalRegularHours > this.overtimeRules.weeklyOvertimeThreshold) {
            const excessHours = totalRegularHours - this.overtimeRules.weeklyOvertimeThreshold;
            totalRegularHours = this.overtimeRules.weeklyOvertimeThreshold;
            totalOvertimeHours += excessHours;
        }
        return {
            weekStartDate,
            weekEndDate,
            dailyCalculations,
            totalRegularHours: Math.round(totalRegularHours * 100) / 100,
            totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
            totalDoubleTimeHours: Math.round(totalDoubleTimeHours * 100) / 100,
            totalHours: Math.round(totalHours * 100) / 100,
            totalBreakTime: Math.round(totalBreakTime * 100) / 100
        };
    }
    /**
     * Calculate pay period totals
     */
    calculatePayPeriodHours(timeEntries, payPeriod) {
        const calculations = [];
        // Filter entries for the pay period
        const periodEntries = timeEntries.filter(entry => entry.clockInTime >= payPeriod.startDate && entry.clockInTime <= payPeriod.endDate);
        // Calculate weekly totals for each week in the pay period
        let currentWeekStart = new Date(payPeriod.startDate);
        // Adjust to start of week (Sunday)
        const dayOfWeek = currentWeekStart.getDay();
        currentWeekStart.setDate(currentWeekStart.getDate() - dayOfWeek);
        while (currentWeekStart <= payPeriod.endDate) {
            const weeklyCalc = this.calculateWeeklyHours(periodEntries, currentWeekStart);
            calculations.push(weeklyCalc);
            // Move to next week
            currentWeekStart = new Date(currentWeekStart);
            currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        }
        return calculations;
    }
    /**
     * Calculate break time deductions
     */
    calculateBreakDeductions(breakEntries) {
        let totalBreakTime = 0;
        let paidBreakTime = 0;
        let unpaidBreakTime = 0;
        for (const breakEntry of breakEntries) {
            const duration = breakEntry.calculateDuration();
            totalBreakTime += duration;
            if (breakEntry.paid) {
                paidBreakTime += duration;
            }
            else {
                unpaidBreakTime += duration;
            }
        }
        return {
            totalBreakTime,
            paidBreakTime,
            unpaidBreakTime,
            deductibleTime: unpaidBreakTime // Only unpaid breaks are deducted from worked time
        };
    }
    /**
     * Detect overtime based on daily and weekly thresholds
     */
    detectOvertime(timeEntries, date) {
        const dailyCalc = this.calculateDailyHours(timeEntries, date);
        // Calculate weekly hours for the week containing this date
        const weekStart = this.getWeekStart(date);
        const weeklyCalc = this.calculateWeeklyHours(timeEntries, weekStart);
        return {
            hasDailyOvertime: dailyCalc.overtimeHours > 0 || dailyCalc.doubleTimeHours > 0,
            hasWeeklyOvertime: weeklyCalc.totalOvertimeHours > 0,
            dailyHours: dailyCalc.totalHours,
            weeklyHours: weeklyCalc.totalHours,
            overtimeHours: dailyCalc.overtimeHours + dailyCalc.doubleTimeHours
        };
    }
    /**
     * Handle paid vs unpaid break calculations
     */
    calculateBreakImpact(timeEntry) {
        if (!timeEntry.clockOutTime) {
            return {
                totalWorkTime: 0,
                paidWorkTime: 0,
                breakAdjustment: 0
            };
        }
        const totalMinutes = (timeEntry.clockOutTime.getTime() - timeEntry.clockInTime.getTime()) / (1000 * 60);
        const unpaidBreakTime = timeEntry.getUnpaidBreakTime();
        const totalWorkTime = totalMinutes / 60;
        const paidWorkTime = (totalMinutes - unpaidBreakTime) / 60;
        const breakAdjustment = unpaidBreakTime / 60;
        return {
            totalWorkTime: Math.round(totalWorkTime * 100) / 100,
            paidWorkTime: Math.round(paidWorkTime * 100) / 100,
            breakAdjustment: Math.round(breakAdjustment * 100) / 100
        };
    }
    /**
     * Utility method to check if two dates are on the same day
     */
    isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate();
    }
    /**
     * Get the start of the week (Sunday) for a given date
     */
    getWeekStart(date) {
        const weekStart = new Date(date);
        const dayOfWeek = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);
        return weekStart;
    }
    /**
     * Update overtime rules
     */
    updateOvertimeRules(newRules) {
        this.overtimeRules = { ...this.overtimeRules, ...newRules };
    }
    /**
     * Get current overtime rules
     */
    getOvertimeRules() {
        return { ...this.overtimeRules };
    }
}
