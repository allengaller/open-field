import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import type { JSX } from 'react';
import Home from './pages/Home';
import Collection from './pages/Collection';
import Glossary from './pages/Glossary';
import SearchPage from './pages/SearchPage';

function SearchForm(): JSX.Element {
  const navigate = useNavigate();
  return (
    <form
      className="searchform"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem('q') as HTMLInputElement | null;
        const q = input?.value.trim() ?? '';
        if (q.length > 0) navigate(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <input className="searchform__input" type="search" name="q" placeholder="搜索方法论…" aria-label="搜索知识库" />
      <button className="searchform__btn" type="submit">搜索</button>
    </form>
  );
}

export default function App(): JSX.Element {
  return (
    <div className="site">
      <header className="site__head">
        <Link className="brand" to="/">
          <span className="brand__name">OpenField</span>
          <span className="brand__sub">知识库</span>
        </Link>
        <nav className="site__nav" aria-label="主导航">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>首页</NavLink>
          <NavLink to="/glossary" className={({ isActive }) => (isActive ? 'is-active' : '')}>术语表</NavLink>
        </nav>
        <SearchForm />
      </header>
      <main className="site__main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/c/:cid" element={<Collection />} />
          <Route path="/c/:cid/:chapterId" element={<Collection />} />
          <Route path="/glossary" element={<Glossary />} />
          <Route path="/search" element={<SearchPage />} />
          <Route
            path="*"
            element={
              <div className="page">
                <h1>页面不存在</h1>
                <p>
                  回到<Link to="/">首页</Link>。
                </p>
              </div>
            }
          />
        </Routes>
      </main>
      <footer className="site__foot">
        <span>OpenField · 田野调查知识库</span>
        <span>内容为静态只读语料，证据分级：核验 / 通行共识 / 操作性建议</span>
      </footer>
    </div>
  );
}
