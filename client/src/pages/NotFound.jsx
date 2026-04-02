import React from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Quiz Network - Page Not Found";
  }, []);

  return (
    <div className="user-page">
      <div className="join-screen">
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p className="subtle">The page you're looking for doesn't exist.</p>
        <div className="join-form">
          <button onClick={() => navigate("/")}>
            Go to Quiz
          </button>
          <button onClick={() => navigate("/admin")}>
            Go to Admin Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
