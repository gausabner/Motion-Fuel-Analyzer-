import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
    const tanks = [
        { tankNo: '911', fuelType: 'Petrol' },
        { tankNo: '912', fuelType: 'Diesel' },
        { tankNo: '913', fuelType: 'Diesel' },
        { tankNo: '914', fuelType: 'Diesel' },
        { tankNo: '915', fuelType: 'Diesel' },
        { tankNo: '937', fuelType: 'Diesel' },
        { tankNo: '940', fuelType: 'Diesel' },
        { tankNo: '943', fuelType: 'Petrol Unleaded' },
    ]

    for (const tank of tanks) {
        await prisma.tankDefinition.upsert({
            where: { tankNo: tank.tankNo },
            update: {},
            create: tank,
        })
    }

    // Cost Centres (Departments & Divisions)
    // Cost Centres (Departments & Divisions)
    const costCentres = [
        // DEPARTMENT OF CITY POLICE SERVICES
        { voteNo: "4500101100655", division: "CRIME PREVENTION UNIT", department: "DEPARTMENT OF CITY POLICE SERVICES" },
        { voteNo: "4520151100655", division: "TRAFFIC MANAGEMENT UNIT", department: "DEPARTMENT OF CITY POLICE SERVICES" },
        { voteNo: "4520101100655", division: "SIGNS AND MARKINGS", department: "DEPARTMENT OF CITY POLICE SERVICES" },
        { voteNo: "4500151100655", division: "HUMAN RESOURCES MANAGEMENT & FINANCE UNIT", department: "DEPARTMENT OF CITY POLICE SERVICES" },

        // DEPARTMENT OF ELECTRICITY
        { voteNo: "1500101100655", division: "NETWORK OPERATIONS AND MAINTENACE", department: "DEPARTMENT OF ELECTRICITY" },
        { voteNo: "1500151100655", division: "TRAFFIC LIGHTS", department: "DEPARTMENT OF ELECTRICITY" },
        { voteNo: "1510051100655", division: "PROTECTION & SYSTEMS", department: "DEPARTMENT OF ELECTRICITY" },
        { voteNo: "1500051100655", division: "COMMERCIAL SERVICES", department: "DEPARTMENT OF ELECTRICITY" },
        { voteNo: "1510101100655", division: "ELECTRICITY PRE-PAYMENT", department: "DEPARTMENT OF ELECTRICITY" },
        { voteNo: "1520101100655", division: "ELECTRICITY STREETLIGHTS", department: "DEPARTMENT OF ELECTRICITY" },

        // DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES
        { voteNo: "1030101100655", division: "PARKS, SPORTS, RECREATION & CEMETRIES", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "1030151100655", division: "FACILITY DEVELOPMENT", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "1030201100655", division: "FACILITY MAINTENANCE EAST", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "1030301100655", division: "SPORTS AND RECREATION", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "1030251100655", division: "FACILITY MAINTENANCE WEST", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "1030351100655", division: "BURIAL & CREMATIONS", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "3010051100655", division: "FACILITY MAINTENANCE", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "3520051100655", division: "TECHNICAL SUPPORT", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "1040051100655", division: "EMERGENCY SERVICES & DISASTER RISK MANAGEMENT", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "1040101100655", division: "EMERGENCY SERVICES & DISASTER RISK MANAGEMENT", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "1010051100655", division: "HEALTH & ENVIRONMENT SERVICES", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },
        { voteNo: "1000151100655", division: "SOCIAL & YOUTH DEVELOPMENT", department: "DEPARTMENT OF ECONOMIC DEVELOPEMNT AND COMMUNITY SERVICES" },

        // DEPARTMENT OF HOUSING, PROPERTY MANAGEMENT & HUMAN SETTLEMENTS
        { voteNo: "4000061100655", division: "HOUSING & LAND DELIVERY", department: "DEPARTMENT OF HOUSING, PROPERTY MANAGEMENT & HUMAN SETTLEMENTS" },
        { voteNo: "4000201100655", division: "PROPERTY MANAGEMENT", department: "DEPARTMENT OF HOUSING, PROPERTY MANAGEMENT & HUMAN SETTLEMENTS" },
        { voteNo: "4000301100655", division: "VALUATIONS", department: "DEPARTMENT OF HOUSING, PROPERTY MANAGEMENT & HUMAN SETTLEMENTS" },
        { voteNo: "4000251100655", division: "GEOMATICS", department: "DEPARTMENT OF HOUSING, PROPERTY MANAGEMENT & HUMAN SETTLEMENTS" },
        { voteNo: "4000151100655", division: "HUMAN SETTLEMENT", department: "DEPARTMENT OF HOUSING, PROPERTY MANAGEMENT & HUMAN SETTLEMENTS" },
        { voteNo: "3010251100655", division: "ARCHITECTURE", department: "DEPARTMENT OF HOUSING, PROPERTY MANAGEMENT & HUMAN SETTLEMENTS" },

        // DEPARTMENT OF FINANCE & CUSTOMER SERVICES
        { voteNo: "2000151100655", division: "DEBT AND RISK MANAGEMENT", department: "DEPARTMENT OF FINANCE & CUSTOMER SERVICES" },
        { voteNo: "2000051100655", division: "CASH MANAGEMENT", department: "DEPARTMENT OF FINANCE & CUSTOMER SERVICES" },
        { voteNo: "2010051100655", division: "FINANCIAL REPORTING", department: "DEPARTMENT OF FINANCE & CUSTOMER SERVICES" },
        { voteNo: "6000051100655", division: "MUNICIPAL FLEET", department: "DEPARTMENT OF FINANCE & CUSTOMER SERVICES" },
        { voteNo: "6010551100655", division: "MUNICIPAL FLEET", department: "DEPARTMENT OF FINANCE & CUSTOMER SERVICES" },
        { voteNo: "4000151100655", division: "COMMERCIAL SERVICES", department: "DEPARTMENT OF FINANCE & CUSTOMER SERVICES" },
        { voteNo: "2000101100655", division: "PROCUREMENT", department: "DEPARTMENT OF FINANCE & CUSTOMER SERVICES" },
        { voteNo: "2020051100655", division: "REVENUE MANAGEMENT", department: "DEPARTMENT OF FINANCE & CUSTOMER SERVICES" },

        // DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES
        { voteNo: "3020051100655", division: "BULK WATER & WASTE WATER", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3020151100655", division: "BULK WATER & WASTE WATER", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3020201100655", division: "BULK WATER & WASTE WATER", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3020251100655", division: "BULK WATER & WASTE WATER", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3020301100655", division: "BULK WATER & WASTE WATER", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3020351100655", division: "BULK WATER & WASTE WATER", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3020401100655", division: "BULK WATER & WASTE WATER", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3020501100655", division: "BULK WATER & WASTE WATER", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3040101100655", division: "Water Services Boreholes", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3040051100655", division: "ENGINEERING SERVICES", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3050051100655", division: "ROADS & STORM WATER", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3050101100655", division: "ROADS & STORM WATER", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "6010101100655", division: "GRADERS - ROADS", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "6010401100655", division: "INFRASTRUCTURE", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3000151100655", division: "SCIENTIFIC SERVICES", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3030101100655", division: "SOLID WASTE MANAGEMENT", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3030151100655", division: "SOLID WASTE MANAGEMENT", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3030201100655", division: "SOLID WASTE MANAGEMENT", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "3030301100655", division: "SOLID WASTE MANAGEMENT", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "6010451100655", division: "TANKERS - ROADS", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },
        { voteNo: "6010351100655", division: "ROADS", department: "DEPARTMENT OF INFRASTRUCTURE WATER & TECHNICAL SERVICES" },

        // DEPARTMENT OF INFORMATION, COMMUNICATION & TECHNOLOGY
        { voteNo: "2000251100655", division: "ICT CORE TECHNOLOGY INFRASTRUCTURE", department: "DEPARTMENT OF INFORMATION, COMMUNICATION & TECHNOLOGY" },
        // { voteNo: "352005 1100655", division: "ICT CORE TECHNOLOGY INFRASTRUCTURE", department: "DEPARTMENT OF INFORMATION, COMMUNICATION & TECHNOLOGY" }, // Duplicate with Technical Support

        // DEPARTMENT OF HUMAN CAPITAL & CORPORATE SERVICES
        { voteNo: "2510101100655", division: "OCCUPATIONAL HEALTH, SAFETY AND WELLNESS", department: "DEPARTMENT OF HUMAN CAPITAL & CORPORATE SERVICES" },
        { voteNo: "2510051100655", division: "CORPORATE SERVICES", department: "DEPARTMENT OF HUMAN CAPITAL & CORPORATE SERVICES" },
        { voteNo: "2500101100655", division: "CORPORATE SERVICES", department: "DEPARTMENT OF HUMAN CAPITAL & CORPORATE SERVICES" },

        // OFFICE OF THE CHIEF EXECUTIVE OFFICER
        { voteNo: "510051100655", division: "MARKETING & PUBLIC PARTICIPATION", department: "OFFICE OF THE CHIEF EXECUTIVE OFFICER" },
        { voteNo: "510301100655", division: "MARKETING & PUBLIC PARTICIPATION", department: "OFFICE OF THE CHIEF EXECUTIVE OFFICER" },
        { voteNo: "510401100655", division: "MARKETING & PUBLIC PARTICIPATION", department: "OFFICE OF THE CHIEF EXECUTIVE OFFICER" },
        { voteNo: "520051100655", division: "MAYORAL & COUNCIL AFFAIRS", department: "OFFICE OF THE CHIEF EXECUTIVE OFFICER" },
        { voteNo: "520101100655", division: "EXTERNAL RELATIONS & NETWORKING", department: "OFFICE OF THE CHIEF EXECUTIVE OFFICER" },

        // DEPARTMENT OF URBAN AND TRANSPORT PLANNING
        { voteNo: "1020151100655", division: "INFO", department: "DEPARTMENT OF URBAN AND TRANSPORT PLANNING" },
        { voteNo: "1020051100655", division: "BUSINESS DEVELOPEMENT", department: "DEPARTMENT OF URBAN AND TRANSPORT PLANNING" },
        { voteNo: "5000201100655", division: "BUILDING CONTROL", department: "DEPARTMENT OF URBAN AND TRANSPORT PLANNING" },
        { voteNo: "5010151100655", division: "PLANNING, DESIGN & TRAFFIC FLOW", department: "DEPARTMENT OF URBAN AND TRANSPORT PLANNING" },
        { voteNo: "5010051100655", division: "ROADS PLANNING & TRAFFIC FLOW", department: "DEPARTMENT OF URBAN AND TRANSPORT PLANNING" },
        { voteNo: "5000181100655", division: "SUSTAINABLE DEVELOPMENT", department: "DEPARTMENT OF URBAN AND TRANSPORT PLANNING" },
        { voteNo: "5000111100655", division: "PUBLIC TRANSPORT", department: "DEPARTMENT OF URBAN AND TRANSPORT PLANNING" },
        { voteNo: "5000131150275", division: "URBAN POLICY", department: "DEPARTMENT OF URBAN AND TRANSPORT PLANNING" },
        { voteNo: "5000131100655", division: "URBAN POLICY", department: "DEPARTMENT OF URBAN AND TRANSPORT PLANNING" },
        { voteNo: "6020051100655", division: "BUILDING MAINTANANCE", department: "DEPARTMENT OF URBAN AND TRANSPORT PLANNING" },
    ];

    for (const cc of costCentres) {
        await prisma.costCentre.upsert({
            where: { voteNo: cc.voteNo },
            update: { division: cc.division, department: cc.department },
            create: cc,
        });
    }
    const users = [
        { email: 'admin@motion.com', name: 'Super Admin', role: 'SUPER_ADMIN' },
        { email: 'sysadmin@motion.com', name: 'System Admin', role: 'SYSTEM_ADMIN' },
        { email: 'head@motion.com', name: 'System Head', role: 'SYSTEM_HEAD' },
        { email: 'employee@motion.com', name: 'Field Employee', role: 'EMPLOYEE' },
    ]

    for (const user of users) {
        await prisma.user.upsert({
            where: { email: user.email },
            update: {},
            create: user,
        })
    }

    // Initialize System Settings
    await prisma.systemSettings.upsert({
        where: { id: 'global' },
        update: {},
        create: {
            id: 'global',
            currencyCode: 'NAD',
            currencySymbol: 'N$',
            fuelRate: 19.95
        }
    })

    console.log('Seeding completed.')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
