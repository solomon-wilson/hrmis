export default function ReportsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Reports</h1>
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="font-semibold">Available Reports</h2>
        {/* Add reports list here */}
        <ul>
          <li><a href="#" className="text-blue-500 hover:underline">Employee Directory</a></li>
          <li><a href="#" className="text-blue-500 hover:underline">Headcount Report</a></li>
          <li><a href="#" className="text-blue-500 hover:underline">Turnover Report</a></li>
        </ul>
      </div>
    </div>
  );
}
