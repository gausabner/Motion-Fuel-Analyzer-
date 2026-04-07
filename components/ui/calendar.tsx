"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn("p-4", className)}
            classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4",
                month_caption: "flex justify-center pt-1 relative items-center mb-4",
                caption_label: "text-sm font-bold text-foreground",
                nav: "space-x-1 flex items-center",
                button_previous: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-muted transition-all duration-300 absolute left-4 top-4 z-20"
                ),
                button_next: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-muted transition-all duration-300 absolute right-4 top-4 z-20"
                ),
                month_grid: "w-full border-collapse space-y-1",
                weekdays: "flex justify-between mb-2",
                weekday: "text-muted-foreground w-10 font-bold text-[0.7rem] uppercase tracking-tighter text-center",
                week: "flex w-full mt-2 lg:gap-1",
                day: cn(
                    "h-9 w-9 p-0 font-normal aria-selected:opacity-100 flex items-center justify-center rounded-full text-sm cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)] hover:scale-110 active:scale-95 z-10 relative"
                ),
                day_button: "h-full w-full flex items-center justify-center",
                selected: "bg-accent text-accent-foreground shadow-md scale-105 font-bold z-20",
                today: "bg-muted text-foreground font-extrabold border-2 border-primary/20",
                outside: "day-outside text-muted-foreground opacity-30 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                disabled: "text-muted-foreground opacity-20",
                range_middle: "aria-selected:bg-accent/20 aria-selected:text-foreground aria-selected:scale-100 rounded-none first:rounded-l-full last:rounded-r-full z-0",
                range_start: "bg-accent text-accent-foreground rounded-l-full rounded-r-none z-20",
                range_end: "bg-accent text-accent-foreground rounded-r-full rounded-l-none z-20",
                hidden: "invisible",
                ...classNames,
            }}
            components={{
                Chevron: (props) => {
                    if (props.orientation === 'left') return <ChevronLeft className="h-4 w-4" />
                    return <ChevronRight className="h-4 w-4" />
                }
            }}
            {...props}
        />
    );
}
Calendar.displayName = "Calendar";

export { Calendar };
