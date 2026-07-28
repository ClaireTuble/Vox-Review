import { Search } from 'lucide-react';
import '../css/tables.css';

export default function SearchBar({ placeholder = 'Search users or accounts' }) {
  return (
    <label className="search-bar">
      <Search size={15} />
      <input type="text" placeholder={placeholder} />
    </label>
  );
}
