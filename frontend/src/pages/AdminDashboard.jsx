import React, { useEffect, useState } from "react";
import axios from "../api/axios";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/Components/ui/Card";
import { Button } from "@/Components/ui/button";

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lawyers, setLawyers] = useState([]);
  const [lawyerStatusFilter, setLawyerStatusFilter] = useState("pending");
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteRole, setPromoteRole] = useState("admin");
  const [newAdmin, setNewAdmin] = useState({ email: "", username: "", name: "", password: "" });

  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin") {
      toast.error("This dashboard is only available to admin users.");
      navigate("/");
      return;
    }

    const loadLawyers = async () => {
      try {
        const response = await axios.get(
          `api/auth/admin/lawyers/${lawyerStatusFilter ? `?status=${lawyerStatusFilter}` : ""}`
        );
        setLawyers(response.data || []);
      } catch (err) {
        console.error("Failed to load lawyers for admin:", err);
        toast.error(err.response?.data?.error || "Unable to load lawyers.");
      } finally {
        setLoading(false);
      }
    };

    loadLawyers();
  }, [user, navigate, lawyerStatusFilter]);

  const handleVerifyLawyer = async (lawyerUserId, verification_status) => {
    try {
      const response = await axios.patch(`api/auth/admin/lawyers/${lawyerUserId}/verify/`, {
        verification_status,
      });
      toast.success(response.data?.message || "Lawyer verification updated.");
      // Refresh list
      const refreshed = await axios.get(
        `api/auth/admin/lawyers/${lawyerStatusFilter ? `?status=${lawyerStatusFilter}` : ""}`
      );
      setLawyers(refreshed.data || []);
    } catch (err) {
      console.error("Failed to verify lawyer:", err);
      toast.error(err.response?.data?.error || "Unable to update lawyer status.");
    }
  };

  const handlePromoteUser = async (e) => {
    e.preventDefault();
    if (!promoteEmail) {
      toast.error("Please enter an email to promote.");
      return;
    }
    try {
      const response = await axios.post("api/auth/admin/users/promote/", {
        email: promoteEmail,
        role: promoteRole,
      });
      toast.success(response.data?.message || "User promoted successfully.");
      setPromoteEmail("");
      setPromoteRole("admin");
    } catch (err) {
      console.error("Failed to promote user:", err);
      toast.error(err.response?.data?.error || "Unable to promote user.");
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    const { email, username, password } = newAdmin;
    if (!email || !username || !password) {
      toast.error("Email, username, and password are required.");
      return;
    }
    try {
      const response = await axios.post("api/auth/admin/users/create-admin/", newAdmin);
      toast.success(response.data?.message || "Admin user created.");
      setNewAdmin({ email: "", username: "", name: "", password: "" });
    } catch (err) {
      console.error("Failed to create admin user:", err);
      const data = err.response?.data;
      let msg = data?.error || "Unable to create admin user.";
      if (typeof data === "object" && !data.error) {
        const firstKey = Object.keys(data)[0];
        const firstVal = data[firstKey];
        if (Array.isArray(firstVal) && firstVal.length > 0) {
          msg = firstVal[0];
        } else if (typeof firstVal === "string") {
          msg = firstVal;
        }
      }
      toast.error(msg);
    }
  };

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="container mx-auto py-10 animate-fade-in space-y-8">
      <Card className="bg-card border-border backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl text-foreground">Admin Dashboard</CardTitle>
          <CardDescription className="text-muted-foreground">
            Review and verify lawyers, and manage admin users.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-foreground text-lg">Lawyer Verification</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Approve or reject lawyers so they appear in Lawyer Connect.
                </CardDescription>
              </div>
              <select
                value={lawyerStatusFilter}
                onChange={(e) => setLawyerStatusFilter(e.target.value)}
                className="bg-background border border-border text-sm rounded-md px-3 py-1 text-foreground"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="">All</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && (
              <div className="text-muted-foreground text-sm">Loading lawyers...</div>
            )}
            {!loading && lawyers.length === 0 && (
              <div className="text-muted-foreground text-sm">
                No lawyers found for this status.
              </div>
            )}
            {lawyers.map((lawyer) => (
              <div
                key={lawyer.id}
                className="border border-border rounded-lg p-4 bg-background/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                <div>
                  <p className="text-foreground font-semibold">
                    {lawyer.user?.name || lawyer.user?.username || "Lawyer"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {lawyer.user?.email}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Status:{" "}
                    <span
                      className={`uppercase font-bold ${
                        lawyer.verification_status === "approved"
                          ? "text-green-500"
                          : lawyer.verification_status === "rejected"
                          ? "text-red-500"
                          : "text-orange-500"
                      }`}
                    >
                      {lawyer.verification_status}
                    </span>
                  </p>
                  {lawyer.specializations && lawyer.specializations.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Specializations: {lawyer.specializations.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {lawyer.verification_status === "pending" ? (
                    <>
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleVerifyLawyer(lawyer.user?.id, "approved")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleVerifyLawyer(lawyer.user?.id, "rejected")}
                      >
                        Reject
                      </Button>
                    </>
                  ) : (
                    <span
                      className={`px-3 py-2 rounded-md text-sm font-semibold ${
                        lawyer.verification_status === "approved"
                          ? "bg-green-500/20 text-green-600"
                          : lawyer.verification_status === "rejected"
                          ? "bg-red-500/20 text-red-600"
                          : "text-muted-foreground" // Fallback for other statuses
                      }`}
                    >
                      {lawyer.verification_status.toUpperCase()}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteLawyer(lawyer.user?.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-lg">Promote User</CardTitle>
              <CardDescription className="text-muted-foreground">
                Promote an existing user (including Google users) to admin or another role.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handlePromoteUser}>
                <input
                  type="email"
                  value={promoteEmail}
                  onChange={(e) => setPromoteEmail(e.target.value)}
                  placeholder="User email"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                />
                <select
                  value={promoteRole}
                  onChange={(e) => setPromoteRole(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                >
                  <option value="admin">Admin</option>
                  <option value="lawyer">Lawyer</option>
                  <option value="client">Client</option>
                </select>
                <Button type="submit" className="w-full">
                  Promote
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-lg">Create Admin User</CardTitle>
              <CardDescription className="text-muted-foreground">
                Add a new admin who can log in with email and password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleCreateAdmin}>
                <input
                  type="email"
                  value={newAdmin.email}
                  onChange={(e) =>
                    setNewAdmin((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="Email"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                />
                <input
                  type="text"
                  value={newAdmin.username}
                  onChange={(e) =>
                    setNewAdmin((prev) => ({ ...prev, username: e.target.value }))
                  }
                  placeholder="Username"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                />
                <input
                  type="text"
                  value={newAdmin.name}
                  onChange={(e) =>
                    setNewAdmin((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Full name (optional)"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                />
                <input
                  type="password"
                  value={newAdmin.password}
                  onChange={(e) =>
                    setNewAdmin((prev) => ({ ...prev, password: e.target.value }))
                  }
                  placeholder="Password"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                />
                <Button type="submit" className="w-full">
                  Create Admin
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;


