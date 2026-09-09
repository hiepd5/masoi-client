export default function Campfire() {
  return (
    <div className="campfire-3d">
      <div className="campfire-logs">
        <div className="log log-1" />
        <div className="log log-2" />
      </div>
      <div className="flame-group">
        <div className="flame flame-outer" />
        <div className="flame flame-mid" />
        <div className="flame flame-inner" />
        <div className="flame flame-core" />
      </div>
      <div className="campfire-embers">
        {[...Array(8)].map((_, i) => <div key={i} className={`ember ember-${i+1}`} />)}
      </div>
      <div className="campfire-glow" />
    </div>
  );
}
