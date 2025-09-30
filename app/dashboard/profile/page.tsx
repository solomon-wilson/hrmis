import { getProfileData } from '../actions';

export default async function ProfilePage() {
  const data = await getProfileData();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">My Profile</h1>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="font-semibold">Personal Information</h2>
        <p>Name: {data.personal.name}</p>
        <p>Email: {data.personal.email}</p>
      </div>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="font-semibold">Job Information</h2>
        <p>Title: {data.job.title}</p>
        <p>Department: {data.job.department}</p>
        <p>Manager: {data.job.manager}</p>
      </div>
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="font-semibold">Documents</h2>
        <ul>
          {data.documents.map((doc) => (
            <li key={doc.name}>
              <a href={doc.url} className="text-blue-500 hover:underline">{doc.name}</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}