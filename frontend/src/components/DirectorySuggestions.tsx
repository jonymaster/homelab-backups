import { useState, useEffect, useRef } from "react";
import { listDirectory } from "@/app/api";

interface DirectorySuggestionsProps {
  path: string;
  onSelect: (path: string) => void;
}

export default function DirectorySuggestions({
  path,
  onSelect,
}: DirectorySuggestionsProps) {
  const [allSuggestions, setAllSuggestions] = useState<string[]>([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [lastPath, setLastPath] = useState<string>("");
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (path && path !== lastPath && path.endsWith("/")) {
      listDirectory(path)
        .then((directories) => {
          setAllSuggestions(directories);
          setFilteredSuggestions(directories);
          setLastPath(path);
        })
        .catch(() => {
          setAllSuggestions([]);
          setFilteredSuggestions([]);
          setLastPath(path);
        });
    }
  }, [path, lastPath]);

  useEffect(() => {
    const filter = path.split("/").pop() || "";
    setFilteredSuggestions(
      allSuggestions.filter((dir) => dir.includes(filter))
    );
  }, [path, allSuggestions]);

  const handleSelect = (suggestion: string) => {
    const basePath = path.substring(0, path.lastIndexOf("/") + 1);
    onSelect(`${basePath}${suggestion}/`);
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (
      suggestionsRef.current &&
      !suggestionsRef.current.contains(event.target as Node)
    ) {
      setFilteredSuggestions([]);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div ref={suggestionsRef}>
      {filteredSuggestions.length > 0 && (
        <ul className="bg-gray-700 border border-gray-600 rounded-md mt-1">
          {filteredSuggestions.map((suggestion) => (
            <li
              key={suggestion}
              className="p-2 hover:bg-gray-600 cursor-pointer"
              onClick={() => handleSelect(suggestion)}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
