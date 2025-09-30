export default function ProfilePage() {
    return (<div>
      <h1 className="text-2xl font-semibold mb-4">My Profile</h1>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="font-semibold">Personal Information</h2>
        {/* Add profile information here */}
        <p>Name: John Doe</p>
        <p>Email: john.doe@example.com</p>
      </div>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="font-semibold">Job Information</h2>
        {/* Add job information here */}
        <p>Title: Software Engineer</p>
        <p>Department: Technology</p>
        <p>Manager: Jane Smith</p>
      </div>
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="font-semibold">Documents</h2>
        {/* Add documents here */}
        <ul>
          <li><a href="#" className="text-blue-500 hover:underline">Offer Letter</a></li>
          <li><a href="#" className="text-blue-500 hover:underline">W-4</a></li>
        </ul>
      </div>
    </div>);
}
