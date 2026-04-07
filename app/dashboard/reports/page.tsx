import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FISTable } from "@/components/reports/FISTable";
import { FRETable } from "@/components/reports/FRETable";
import { DailyConsumptionTable } from "@/components/reports/DailyConsumptionTable";
import { TopFleetTable } from "@/components/reports/TopFleetTable";
import { CostCentreTable } from "@/components/reports/CostCentreTable";
import {
    getFISData,
    getFREData,
    getDailyConsumption,
    getTopFleet,
    getCostCentreAnalysis
} from "@/lib/analytics";
import { ReportsFilters } from "@/components/reports/ReportsFilters";

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
    searchParams
}: {
    searchParams: Promise<{ from?: string, to?: string }>
}) {
    const params = await searchParams;
    const { from, to } = params;

    const fisData = await getFISData(100, from, to);
    const freData = await getFREData(100, from, to);
    const dailyData = await getDailyConsumption(from, to);
    const fleetPetrol = await getTopFleet('Petrol', from, to);
    const fleetDiesel = await getTopFleet('Diesel', from, to);
    const costCentreData = await getCostCentreAnalysis();

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Advanced Analytics</h2>
                <p className="text-slate-500">Comprehensive breakdown of fleet efficiency, consumption, and departmental costs.</p>
            </div>

            <ReportsFilters />

            <Tabs defaultValue="transactions" className="space-y-4">
                <TabsList className="bg-slate-100 p-1">
                    <TabsTrigger value="transactions" className="data-[state=active]:bg-white shadow-none">Transactions (FIS/FRE)</TabsTrigger>
                    <TabsTrigger value="consumption" className="data-[state=active]:bg-white shadow-none">Daily Consumption</TabsTrigger>
                    <TabsTrigger value="fleet" className="data-[state=active]:bg-white shadow-none">Fleet Analysis</TabsTrigger>
                    <TabsTrigger value="costcentre" className="data-[state=active]:bg-white shadow-none">Cost Centres</TabsTrigger>
                </TabsList>

                <TabsContent value="transactions" className="space-y-4">
                    <Card className="monumental-card">
                        <CardHeader>
                            <CardTitle>Fuel Issues (FIS)</CardTitle>
                            <CardDescription>Fuel issued to vehicles (removed from tank).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FISTable data={fisData} />
                        </CardContent>
                    </Card>

                    <Card className="monumental-card">
                        <CardHeader>
                            <CardTitle>Fuel Receipts (FRE)</CardTitle>
                            <CardDescription>Fuel received into tanks (stock replenishment).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FRETable data={freData} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="consumption" className="space-y-4">
                    <Card className="monumental-card">
                        <CardHeader>
                            <CardTitle>Daily Consumption</CardTitle>
                            <CardDescription>Daily breakdown of fuel usage and costs.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <DailyConsumptionTable data={dailyData} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="fleet" className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <Card className="monumental-card">
                            <CardHeader>
                                <CardTitle>Top 10 Petrol Fleet</CardTitle>
                                <CardDescription>Highest consuming petrol vehicles.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <TopFleetTable data={fleetPetrol} />
                            </CardContent>
                        </Card>
                        <Card className="monumental-card">
                            <CardHeader>
                                <CardTitle>Top 10 Diesel Fleet</CardTitle>
                                <CardDescription>Highest consuming diesel vehicles.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <TopFleetTable data={fleetDiesel} />
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="costcentre" className="space-y-4">
                    <Card className="monumental-card">
                        <CardHeader>
                            <CardTitle>Cost Centre Analysis</CardTitle>
                            <CardDescription>Fuel consumption by Vote Number and Department.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CostCentreTable data={costCentreData} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
