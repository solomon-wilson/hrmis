import { getDashboardData } from './actions';

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="font-semibold">Welcome</h2>
          <p>Welcome to your dashboard, {data.user.name}.</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="font-semibold">My Team</h2>
          <p>You have {data.team.count} team members.</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="font-semibold">Quick Links</h2>
          <ul>
            <li><a href="#" className="text-blue-500 hover:underline">Request Time Off</a></li>
            <li><a href="#" className="text-blue-500 hover:underline">Submit Expense</a></li>
            <li><a href="#" className="text-blue-500 hover:underline">View Payslip</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}