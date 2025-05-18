node scripts/testREEApi.js --start 2025-05-05 --end 2025-05-20 --detail --analyze
node scripts/seedDatabase.js --start 2025-05-05 --end 2025-05-20 --time-scope day --verbose --dry-run


node scripts/seedDatabase.js --start 2019-01-01 --end 2019-01-31 --time-scope day --verbose

{
electricBalanceStats(
dateRange: {
startDate: "2025-05-01T00:00:00Z",
endDate: "2025-05-16T23:59:59Z",
timeScope: "day"
}
) {
generation {
average
max
min
}
demand {
average
max
min
}
renewablePercentage {
average
max
min
}
count
}
}

{
generationDistribution(
dateRange: {
startDate: "2025-05-01T00:00:00Z",
endDate: "2025-05-16T23:59:59Z",
timeScope: "day"
}
) {
type
totalValue
avgValue
percentage
color
}
}

{
latestElectricBalance {
id
timestamp
timeScope
totalGeneration
totalDemand
renewablePercentage
balance
generation {
type
value
percentage
color
}
demand {
type
value
percentage
}
}
}

{
electricBalance(id: "68280238a4192067b6703297") {
id
timestamp
timeScope
totalGeneration
totalDemand
renewablePercentage
balance
generation {
type
value
percentage
}
}
}

{
electricBalanceByDateRange(
dateRange: {
startDate: "2025-05-01T00:00:00Z",
endDate: "2025-05-16T23:59:59Z",
timeScope: "day"
},
pagination: {
page: 1
pageSize: 10
orderBy: "timestamp"
orderDirection: "DESC"
}
) {
items {
id
timestamp
totalGeneration
totalDemand
renewablePercentage
}
totalCount
page
pageSize
hasNextPage
hasPreviousPage
}
}

{
electricBalanceStats(
dateRange: {
startDate: "2025-05-01T00:00:00Z",
endDate: "2025-05-16T23:59:59Z",
timeScope: "day"
}
) {
generation {
average
max
min
}
demand {
average
max
min
}
renewablePercentage {
average
max
min
}
count
startDate
endDate
timeScope
}
}


{
generationDistribution(
dateRange: {
startDate: "2025-05-01T00:00:00Z",
endDate: "2025-05-16T23:59:59Z",
timeScope: "day"
}
) {
type
totalValue
avgValue
maxValue
minValue
percentage
color
count
}
}


{
electricBalanceTimeSeries(
dateRange: {
startDate: "2023-01-01T00:00:00Z"
endDate: "2023-01-31T23:59:59Z"
timeScope: "day"
},
indicator: "totalGeneration"  # Opciones: totalGeneration, totalDemand, balance, renewablePercentage
) {
timestamp
value
}
}

{
compareElectricBalancePeriods(
periods: {
currentStartDate: "2023-01-01T00:00:00Z"
currentEndDate: "2023-01-31T23:59:59Z"
previousStartDate: "2025-05-01T00:00:00Z"
previousEndDate: "2025-05-16T23:59:59Z"
timeScope: "day"
}
)
}

{
electricBalanceAnalysis(
dateRange: {
startDate: "2025-05-01T00:00:00Z",
endDate: "2025-05-16T23:59:59Z",
timeScope: "day"
},
options: {
includePatterns: true
includeSustainability: true
}
) {
stats {
generation {
average
max
min
}
demand {
average
max
min
}
renewablePercentage {
average
max
min
}
count
}
generationDistribution {
type
totalValue
percentage
color
}
generationSeries {
timestamp
value
}
demandSeries {
timestamp
value
}
renewableSeries {
timestamp
value
}
balanceSeries {
timestamp
value
}
trends
}
}

