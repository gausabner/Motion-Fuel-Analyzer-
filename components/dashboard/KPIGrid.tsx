"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Fuel, Droplets, TrendingUp, Wallet } from "lucide-react";
import { motion } from "framer-motion";

export function KPICards({ data, currencySymbol = "N$", onCardClick }: { data: any, currencySymbol?: string, onCardClick?: (type: string) => void }) {
    const cards = [
        {
            title: "Total Petrol",
            value: `${data.petrol.toFixed(0)} L`,
            label: "+2.5% from last month",
            icon: Fuel,
            color: "#B99A8B",
            trend: "up"
        },
        {
            title: "Total Diesel",
            value: `${data.diesel.toFixed(0)} L`,
            label: "+1.1% from last month",
            icon: Droplets,
            color: "#AC3F46",
            trend: "up"
        },
        {
            title: "Total Cost",
            value: `${currencySymbol}${data.totalCost.toLocaleString()}`,
            label: "-4% from last month",
            icon: Wallet,
            color: "var(--muted-foreground)",
            trend: "down"
        },
        {
            title: "Efficiency",
            value: "12.4 km/L",
            label: "Good Status",
            icon: TrendingUp,
            color: "#2E865F",
            trend: "success"
        }
    ];

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, idx) => (
                <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={onCardClick && (card.title.includes('Petrol') || card.title.includes('Diesel')) ? "cursor-pointer" : ""}
                    onClick={() => {
                        if (onCardClick && (card.title.includes('Petrol') || card.title.includes('Diesel'))) {
                            onCardClick(card.title.includes('Petrol') ? 'Petrol' : 'Diesel');
                        }
                    }}
                >
                    <Card className="glass-panel border-t-4 card-hover overflow-hidden" style={{ borderTopColor: card.color }}>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-bold uppercase tracking-wider text-brand-secondary">{card.title}</span>
                                <card.icon className="h-5 w-5" style={{ color: card.color }} />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-3xl font-bold tracking-tight text-brand-dark">{card.value}</h3>
                                <div className="flex items-center gap-1">
                                    <span className={`text-xs font-semibold ${card.trend === 'success' ? 'text-status-success' :
                                        card.trend === 'up' ? 'text-status-error' : 'text-status-success'
                                        }`}>
                                        {card.label}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            ))}
        </div>
    );
}
